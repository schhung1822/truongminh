import "server-only";
import { randomInt } from "node:crypto";
import { Prisma, type ZaloContact } from "@/generated/prisma/client";
import { ChatError, getChatProvider } from "@/lib/ai/chat";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { todayKey } from "@/lib/jobs/limits";
import { getKieCredits } from "@/lib/providers";
import { getSettings } from "@/lib/settings";
import { getStorage } from "@/lib/storage";
import { zonedStartOfDay } from "@/lib/time";
import { buildChatMessages, buildSystemPrompt, extractHandoff, type HistoryItem } from "./bot-prompt";
import { ZaloError, type ZaloClient } from "./client";
import { helpText, parseCommand, PUBLIC_COMMANDS, type CommandName } from "./commands";
import { describeHours, isWithinHours } from "./hours";
import { getZaloClient } from "./index";
import { containsKeyword, findQuickReply, parseKeywords } from "./keywords";
import { getZaloSettings, type ZaloSettings } from "./settings";
import { preview, prepareReply, splitMessage } from "./text";

/**
 * Bộ não của bot Zalo: nhận tin từ webhook, xử lý ghép nối và lệnh gõ nhanh, lời chào, từ khóa chuyển nhân viên,
 * trả lời nhanh, bot AI (kie.ai) trả lời khách. Mỗi chức năng có công tắc riêng trong cấu hình Zalo (Quản trị > Zalo).
 */

/* ---------- Kiểu dữ liệu webhook ---------- */

export type ZaloMessagePayload = {
  message_id?: string;
  date?: number;
  message_type?: string;
  from?: { id?: string; display_name?: string; is_bot?: boolean };
  chat?: { id?: string; chat_type?: string };
  text?: string;
  photo_url?: string;
  caption?: string;
  sticker?: string;
  voice_url?: string;
  file_url?: string;
  file_name?: string;
};
export type ZaloEvent = { event_name?: string; message?: ZaloMessagePayload };

type Kind = "TEXT" | "IMAGE" | "FILE" | "VOICE" | "STICKER" | "OTHER";

const GAP_BETWEEN_CHUNKS_MS = 350;
const MAX_INBOUND_IMAGE_BYTES = 10 * 1024 * 1024;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/* ---------- Khóa theo từng cuộc chat: tin của cùng một người xử lý lần lượt ---------- */

const g = globalThis as unknown as { __zaloLocks?: Map<string, Promise<unknown>> };

function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const locks = (g.__zaloLocks ??= new Map());
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(key, next);
  void next.then(
    () => locks.get(key) === next && locks.delete(key),
    () => locks.get(key) === next && locks.delete(key),
  );
  return next;
}

/* ---------- Nhận tin ---------- */

function classify(ev: ZaloEvent): { kind: Kind; text: string } {
  const m = ev.message ?? {};
  switch (ev.event_name) {
    case "message.text.received":
      return { kind: "TEXT", text: (m.text ?? "").trim() };
    case "message.image.received":
      return { kind: "IMAGE", text: (m.caption ?? "").trim() };
    case "message.sticker.received":
      return { kind: "STICKER", text: "[Sticker]" };
    case "message.voice.received":
      return { kind: "VOICE", text: "[Tin thoại]" };
    case "message.file.received":
      return { kind: "FILE", text: `[File${m.file_name ? `: ${m.file_name}` : ""}]` };
    default:
      return { kind: "OTHER", text: "[Tin nhắn Zalo chưa hỗ trợ]" };
  }
}

/** Có chức năng nào trả lời khách tự động đang bật không. */
function customerAutomation(s: ZaloSettings): boolean {
  return s.chatbot || s.quickReplies || s.welcome;
}

/** Điểm vào duy nhất cho webhook. Không bao giờ ném lỗi ra ngoài (Zalo chỉ cần nhận 200). */
export async function processWebhook(ev: ZaloEvent): Promise<void> {
  try {
    const msg = ev.message;
    const chatId = msg?.chat?.id;
    if (!msg || typeof chatId !== "string" || chatId.length === 0 || chatId.length > 100) return;
    if (msg.from?.is_bot) return;

    const client = getZaloClient();
    const s = await getZaloSettings();
    if (!client || !s.enabled) return;

    const isGroup = msg.chat?.chat_type === "GROUP";
    if (isGroup) {
      // nhận ra nhóm để admin bật "Tự động gửi" (chức năng gửi ảnh vào nhóm)
      const now = new Date();
      await db.zaloGroup.upsert({
        where: { chatId },
        create: { chatId, name: `Nhóm mới (${chatId.slice(0, 6)})`, lastSeenAt: now },
        update: { lastSeenAt: now },
      });
    }

    if (!customerAutomation(s) && !s.commands && !s.pairing) return;

    await serial(chatId, () => handleIncoming(client, s, ev, isGroup));
  } catch (e) {
    console.error("Zalo webhook: lỗi xử lý tin:", errText(e));
  }
}

async function handleIncoming(client: ZaloClient, s: ZaloSettings, ev: ZaloEvent, isGroup: boolean) {
  const msg = ev.message!;
  const chatId = msg.chat!.id!;
  const { kind, text } = classify(ev);
  // Chỉ lưu nội dung hội thoại khi bot AI bật (để bot đọc ngữ cảnh). Các chức năng khác không cần lưu.
  const recording = s.chatbot;

  const name = (msg.from?.display_name ?? "").trim().slice(0, 150) || (isGroup ? "Nhóm Zalo" : "Khách Zalo");
  const known = await db.zaloContact.findUnique({ where: { chatId }, select: { id: true } });
  let contact = await db.zaloContact.upsert({
    where: { chatId },
    create: { chatId, chatType: isGroup ? "GROUP" : "PRIVATE", displayName: name },
    update: isGroup ? {} : { displayName: name },
  });
  const isNew = !known;

  // Lệnh gõ nhanh / ghép nối (chỉ chat riêng)
  const cmd = kind === "TEXT" && !isGroup ? parseCommand(text) : null;
  const cmdEnabled = cmd && (cmd.name === "pair" ? s.pairing : s.commands && isCommandOn(s, cmd.name));

  if (recording && contact.role !== "BLOCKED") {
    const id = await recordIncoming(contact.id, msg, kind, text);
    if (id === null) return; // Zalo gửi lại tin đã xử lý: bỏ qua
  }

  if (contact.role === "BLOCKED") return;

  if (cmd && cmdEnabled) {
    await runCommand(client, s, contact, cmd.name, recording);
    return;
  }

  // Nhân viên đã ghép nối nhắn chữ thường: gợi ý lệnh, không cho bot AI trả lời như với khách
  if (contact.role === "STAFF" && !isGroup) {
    if (s.commands && kind === "TEXT") await replySystem(client, contact, "Gõ /help để xem các lệnh.", recording);
    return;
  }

  await db.zaloContact.update({
    where: { id: contact.id },
    data: { lastMessageAt: new Date(), lastMessageText: preview(text || kindLabel(kind), 200) },
  });

  if (!customerAutomation(s) || kind === "STICKER") return;
  if (isGroup && !s.groupReply) return;

  contact = await resumeIfDue(contact, s);
  if (contact.botPaused) return;

  const lastText = preview(text || kindLabel(kind), 100);

  // Lời chào cho khách mới (chat riêng)
  if (s.welcome && isNew && !isGroup) {
    await replyBot(client, contact, splitMessage(s.welcomeMessage), undefined, recording);
  }

  // Khách gõ từ khóa muốn gặp nhân viên: chuyển ngay, không tốn token
  if (kind === "TEXT" && containsKeyword(text, parseKeywords(s.handoffKeywords))) {
    await handOff(client, s, contact, lastText, "khách yêu cầu gặp nhân viên", undefined, recording);
    return;
  }

  // Trả lời nhanh theo từ khóa
  if (s.quickReplies && kind === "TEXT") {
    const q = findQuickReply(text, s.quickReplyList);
    if (q) {
      await replyBot(client, contact, splitMessage(q.reply), undefined, recording);
      return;
    }
  }

  if (!s.chatbot) return;

  if (kind === "VOICE" || kind === "FILE" || kind === "OTHER" || (kind === "IMAGE" && !s.vision)) {
    await flagForStaff(client, s, contact, lastText, `khách gửi ${kindLabel(kind).toLowerCase()} mà bot chưa đọc được`, false);
    if (kind !== "OTHER") await replyBot(client, contact, [s.unsupportedReply], undefined, recording);
    return;
  }

  await botAnswer(client, s, contact, isGroup, msg.photo_url, lastText);
}

function isCommandOn(s: ZaloSettings, name: CommandName): boolean {
  return (s.enabledCommands as string[]).includes(name);
}

function kindLabel(kind: Kind): string {
  return kind === "IMAGE" ? "[Ảnh]" : kind === "FILE" ? "[File]" : kind === "VOICE" ? "[Tin thoại]" : kind === "STICKER" ? "[Sticker]" : "[Tin nhắn]";
}

/** Lưu tin đến. Trả về id, hoặc null nếu tin này đã được xử lý trước đó. */
async function recordIncoming(contactId: string, msg: ZaloMessagePayload, kind: Kind, text: string): Promise<string | null> {
  let mediaPath: string | null = null;
  if (kind === "IMAGE" && msg.photo_url) mediaPath = await downloadPhoto(contactId, msg.message_id ?? String(Date.now()), msg.photo_url);
  try {
    const row = await db.zaloMessage.create({
      data: {
        contactId,
        direction: "IN",
        author: "CONTACT",
        kind,
        text: text || null,
        mediaPath,
        zaloMessageId: msg.message_id ?? null,
        createdAt: msg.date ? new Date(msg.date) : new Date(),
      },
    });
    return row.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }
}

/** Tải ảnh khách gửi về kho lưu trữ (link của Zalo có thể hết hạn). Lỗi thì bỏ qua, vẫn lưu tin. */
async function downloadPhoto(contactId: string, messageId: string, url: string): Promise<string | null> {
  try {
    if (!/^https:\/\//i.test(url)) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("jpeg") || type.includes("jpg") ? "jpg" : null;
    if (!ext) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_INBOUND_IMAGE_BYTES) return null;
    const key = `zalo/${contactId}/${messageId.replace(/[^\w.-]/g, "_")}.${ext}`;
    await getStorage().put(key, buf);
    return key;
  } catch {
    return null;
  }
}

/* ---------- Gửi tin ---------- */

type SendMeta = { author: "BOT" | "SYSTEM"; promptTokens?: number; completionTokens?: number };

/** Gửi lần lượt các đoạn chữ cho một cuộc chat và (nếu `record`) lưu từng đoạn vào hội thoại. Trả về lỗi đầu tiên nếu có. */
async function sendChunks(client: ZaloClient, contactId: string, chatId: string, chunks: string[], meta: SendMeta, record: boolean): Promise<string | null> {
  let firstError: string | null = null;
  for (const [i, chunk] of chunks.entries()) {
    let error: string | null = null;
    let zaloId: string | undefined;
    try {
      zaloId = (await client.sendMessage(chatId, chunk))?.message_id;
    } catch (e) {
      error = e instanceof ZaloError ? e.message : errText(e);
      firstError ??= error;
    }
    if (record) {
      await db.zaloMessage.create({
        data: {
          contactId,
          direction: "OUT",
          author: meta.author,
          kind: "TEXT",
          text: chunk,
          zaloMessageId: zaloId ?? null,
          failed: !!error,
          error,
          promptTokens: i === 0 ? (meta.promptTokens ?? null) : null,
          completionTokens: i === 0 ? (meta.completionTokens ?? null) : null,
        },
      });
    }
    if (error) break; // các đoạn sau chắc chắn lỗi y hệt
    if (i < chunks.length - 1) await sleep(GAP_BETWEEN_CHUNKS_MS);
  }
  if (firstError) console.error("Zalo: gửi tin lỗi:", firstError);
  return firstError;
}

async function replySystem(client: ZaloClient, contact: { id: string; chatId: string }, text: string, record: boolean) {
  await sendChunks(client, contact.id, contact.chatId, splitMessage(text), { author: "SYSTEM" }, record);
}

async function replyBot(
  client: ZaloClient,
  contact: { id: string; chatId: string },
  chunks: string[],
  usage: { promptTokens: number; completionTokens: number } | undefined,
  record: boolean,
) {
  await sendChunks(client, contact.id, contact.chatId, chunks, { author: "BOT", ...usage }, record);
}

/* ---------- Chuyển nhân viên ---------- */

/** Thông tin giờ làm việc theo cấu hình, hoặc null nếu không bật. */
function hoursInfo(s: ZaloSettings): { description: string; open: boolean } | null {
  if (!s.hoursEnabled) return null;
  const h = { start: s.hoursStart, end: s.hoursEnd, days: s.hoursDays };
  return { description: describeHours(h), open: isWithinHours(new Date(), getEnv().APP_TIMEZONE, h) };
}

/** Câu bot nói khi chuyển nhân viên: ngoài giờ làm việc thì dùng câu "ngoài giờ". */
function handoffText(s: ZaloSettings): string {
  const h = hoursInfo(s);
  return h && !h.open ? s.afterHoursReply : s.handoffReply;
}

/** Nhắn báo cho các nhân viên đã ghép nối (chat riêng). Lỗi gửi cho ai thì bỏ qua người đó. */
async function notifyStaff(client: ZaloClient, contact: ZaloContact, lastText: string, reason: string) {
  const staff = await db.zaloContact.findMany({ where: { role: "STAFF", chatType: "PRIVATE" }, select: { chatId: true } });
  if (staff.length === 0) return;
  const who = `${contact.displayName}${contact.chatType === "GROUP" ? " (nhóm)" : ""}`;
  const text = `Khách "${who}" cần nhân viên: ${reason}.${lastText ? `\nTin gần nhất: "${lastText}"` : ""}\nGõ /cho để xem các khách đang chờ.`;
  for (const st of staff) {
    try {
      await client.sendMessage(st.chatId, text);
    } catch (e) {
      console.error("Zalo: không báo được nhân viên:", errText(e));
    }
  }
}

/**
 * Đánh dấu khách đang chờ nhân viên; `pause` = bot im ở hội thoại này (đến khi nhân viên gõ /xong hoặc hết "botResumeHours").
 * Chỉ báo nhân viên một lần khi chuyển từ "không chờ" sang "chờ", để không làm phiền.
 */
async function flagForStaff(client: ZaloClient, s: ZaloSettings, contact: ZaloContact, lastText: string, reason: string, pause: boolean) {
  await db.zaloContact.update({
    where: { id: contact.id },
    data: { needsHuman: true, ...(pause ? { botPaused: true, botPausedAt: contact.botPaused && contact.botPausedAt ? contact.botPausedAt : new Date() } : {}) },
  });
  if (!contact.needsHuman && s.staffNotify) await notifyStaff(client, contact, lastText, reason);
}

/** Chuyển khách cho nhân viên: bot im, đánh dấu chờ, nói câu chuyển (nếu chưa có câu của AI), báo nhân viên. */
async function handOff(
  client: ZaloClient,
  s: ZaloSettings,
  contact: ZaloContact,
  lastText: string,
  reason: string,
  usage: { promptTokens: number; completionTokens: number } | undefined,
  record: boolean,
  alreadySpoke = false,
) {
  if (!alreadySpoke) await replyBot(client, contact, [handoffText(s)], usage, record);
  await flagForStaff(client, s, contact, lastText, reason, true);
}

/** Bot đang im mà quá `botResumeHours` giờ thì cho bot trả lời lại. 0 = không tự trả lại. */
async function resumeIfDue(contact: ZaloContact, s: ZaloSettings): Promise<ZaloContact> {
  if (!contact.botPaused) return contact;
  const due = !contact.botPausedAt || (s.botResumeHours > 0 && Date.now() - contact.botPausedAt.getTime() > s.botResumeHours * 3600_000);
  if (!due) return contact;
  return db.zaloContact.update({ where: { id: contact.id }, data: { botPaused: false, botPausedAt: null, needsHuman: false } });
}

/* ---------- Bot AI trả lời ---------- */

async function dayStart(): Promise<Date> {
  return zonedStartOfDay(todayKey(), getEnv().APP_TIMEZONE) ?? new Date(Date.now() - 24 * 3600_000);
}

async function botAnswer(client: ZaloClient, s: ZaloSettings, contact: ZaloContact, isGroup: boolean, photoUrl: string | undefined, lastText: string) {
  const contactId = contact.id;

  // Hạn mức: toàn hệ thống mỗi ngày, và mỗi người mỗi giờ
  const [today, lastHour] = await Promise.all([
    db.zaloMessage.count({ where: { author: "BOT", direction: "OUT", failed: false, createdAt: { gte: await dayStart() } } }),
    db.zaloMessage.count({ where: { contactId, author: "BOT", direction: "OUT", createdAt: { gte: new Date(Date.now() - 3600_000) } } }),
  ]);
  if (today >= s.botDailyLimit || lastHour >= s.botHourlyLimitPerContact) {
    await flagForStaff(client, s, contact, lastText, "bot đã hết hạn mức trả lời", false);
    return;
  }

  if (!isGroup) void client.sendTyping(contact.chatId);

  try {
    const since = contact.contextResetAt ?? new Date(0);
    const rows = await db.zaloMessage.findMany({
      where: { contactId, createdAt: { gt: since }, failed: false },
      orderBy: { createdAt: "desc" },
      take: s.contextMessages,
    });
    const history: HistoryItem[] = rows.reverse().map((r) => ({ author: r.author, text: r.text ?? "" }));
    // Ảnh vừa gửi: đưa link cho AI xem (chỉ tin cuối cùng của khách)
    if (photoUrl && s.vision) {
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].author === "CONTACT") {
          history[i] = { ...history[i], imageUrl: photoUrl };
          break;
        }
      }
    }

    const [materials, settings] = await Promise.all([
      s.includeMaterials
        ? db.material.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { code: true, name: true, groupName: true, printTech: true, descHuman: true, thicknessMm: true } })
        : Promise.resolve([]),
      getSettings(),
    ]);
    const system = buildSystemPrompt({
      botPrompt: s.botPrompt,
      botKnowledge: s.botKnowledge,
      includeMaterials: s.includeMaterials,
      materials,
      workshopName: settings.workshopName,
      contactName: contact.displayName,
      isGroup,
      hours: hoursInfo(s) ?? undefined,
    });

    const result = await getChatProvider().complete({ model: s.chatModel, messages: buildChatMessages(system, history) });
    const { text, handoff } = extractHandoff(result.text);
    const chunks = prepareReply(text);
    const usage = { promptTokens: result.promptTokens, completionTokens: result.completionTokens };

    if (chunks.length > 0) await replyBot(client, contact, chunks, usage, true);
    if (handoff) await handOff(client, s, contact, lastText, "bot không trả lời được hoặc khách muốn gặp người", usage, true, chunks.length > 0);
  } catch (e) {
    // Bot lỗi (hết token, mạng...): ghi lại cho nhân viên thấy, đánh dấu cần người; khách không bị nhắn lỗi kỹ thuật
    const reason = e instanceof ChatError ? e.message : errText(e);
    console.error("Zalo bot: không trả lời được:", reason);
    await db.zaloMessage.create({
      data: { contactId, direction: "OUT", author: "SYSTEM", kind: "OTHER", text: "Bot không trả lời được tin này.", failed: true, error: reason },
    });
    await flagForStaff(client, s, contact, lastText, "bot gặp lỗi khi trả lời", false);
  }
}

/* ---------- Lệnh gõ nhanh và ghép nối ---------- */

async function runCommand(client: ZaloClient, s: ZaloSettings, contact: ZaloContact, name: CommandName, record: boolean) {
  const staff = contact.role === "STAFF";
  const say = (t: string) => replySystem(client, contact, t, record);

  if (name === "pair") {
    if (staff) return say("Tài khoản Zalo này đã được ghép nối rồi.");
    const code = contact.pairCode ?? String(randomInt(1000, 10000));
    await db.zaloContact.update({ where: { id: contact.id }, data: { pairCode: code, pairRequestedAt: new Date() } });
    return say(`Mã ghép nối của bạn là ${code}. Nhờ quản trị viên mở Quản trị > Zalo > Nhân viên và lệnh, đối chiếu đúng mã này rồi bấm "Cho phép". Sau đó gõ /help.`);
  }

  if (!PUBLIC_COMMANDS.has(name) && !staff) {
    return say(s.pairing ? "Lệnh này chỉ dành cho nhân viên đã ghép nối. Gõ /ghepnoi để xin ghép nối." : "Lệnh này chỉ dành cho nhân viên.");
  }

  switch (name) {
    case "help":
      return say(helpText(staff, s.enabledCommands));
    case "reset":
      await db.zaloContact.update({ where: { id: contact.id }, data: { contextResetAt: new Date(), botPaused: false, botPausedAt: null, needsHuman: false } });
      return say("Đã xóa ngữ cảnh, mình bắt đầu lại nhé.");
    case "human":
      await flagForStaff(client, s, contact, "khách gõ /nhanvien", "khách gõ /nhanvien", true);
      return say(handoffText(s));
    case "status":
      return say(await statusText());
    case "today":
      return say(await todayText());
    case "waiting":
      return say(await waitingText());
    case "done": {
      const r = await db.zaloContact.updateMany({
        where: { needsHuman: true, role: "CUSTOMER" },
        data: { needsHuman: false, botPaused: false, botPausedAt: null },
      });
      return say(r.count > 0 ? `Đã đánh dấu xử lý xong ${r.count} khách, bot sẽ trả lời lại các khách đó.` : "Không có khách nào đang chờ.");
    }
  }
}

async function statusText(): Promise<string> {
  const env = getEnv();
  const [credits, running, pending, failedToday] = await Promise.all([
    getKieCredits().catch(() => null),
    db.generatedImage.count({ where: { status: "PROCESSING" } }),
    db.generatedImage.count({ where: { status: "PENDING" } }),
    db.generatedImage.count({ where: { status: "FAILED", createdAt: { gte: await dayStart() } } }),
  ]);
  return [
    `Chế độ AI: ${env.IMAGE_PROVIDER === "kie" ? "kie.ai (thật)" : "ảnh giả (mock)"}`,
    `Token kie.ai còn lại: ${credits === null ? "không xem được" : credits.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`,
    `Ảnh đang tạo: ${running} · đang chờ: ${pending} · lỗi hôm nay: ${failedToday}`,
  ].join("\n");
}

async function todayText(): Promise<string> {
  const rows = await db.usageLog.groupBy({ by: ["userId"], where: { day: todayKey() }, _count: { _all: true } });
  if (rows.length === 0) return "Hôm nay chưa có lượt tạo ảnh nào.";
  const users = await db.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, name: true } });
  const name = new Map(users.map((u) => [u.id, u.name]));
  const total = rows.reduce((n, r) => n + r._count._all, 0);
  const lines = rows.sort((a, b) => b._count._all - a._count._all).map((r) => `• ${name.get(r.userId) ?? "?"}: ${r._count._all}`);
  return [`Hôm nay: ${total} lượt tạo ảnh`, ...lines].join("\n");
}

async function waitingText(): Promise<string> {
  const rows = await db.zaloContact.findMany({
    where: { needsHuman: true, role: "CUSTOMER" },
    orderBy: { lastMessageAt: "desc" },
    take: 10,
    select: { displayName: true, chatType: true, lastMessageText: true },
  });
  if (rows.length === 0) return "Không có khách nào đang chờ nhân viên.";
  const total = await db.zaloContact.count({ where: { needsHuman: true, role: "CUSTOMER" } });
  const lines = rows.map((r) => `• ${r.displayName}${r.chatType === "GROUP" ? " (nhóm)" : ""}: ${preview(r.lastMessageText, 80) || "(chưa có tin)"}`);
  return [`Đang chờ nhân viên: ${total} khách`, ...lines, total > rows.length ? `... và ${total - rows.length} khách nữa` : "", "Xử lý xong thì gõ /xong."]
    .filter(Boolean)
    .join("\n");
}

/** Kiểm tra nhanh model chat: gửi một câu ngắn (tốn rất ít token). Dùng cho nút "Thử AI" của admin. */
export async function testChat(model: string): Promise<{ ok: true; text: string; tokens: number } | { ok: false; error: string }> {
  try {
    const r = await getChatProvider().complete({
      model,
      messages: [{ role: "user", content: [{ type: "text", text: "Trả lời đúng một từ: OK" }] }],
    });
    return { ok: true, text: r.text.slice(0, 80), tokens: r.promptTokens + r.completionTokens };
  } catch (e) {
    return { ok: false, error: e instanceof ChatError ? e.message : errText(e) };
  }
}
