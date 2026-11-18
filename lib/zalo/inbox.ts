import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { ChatError, getChatProvider } from "@/lib/ai/chat";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { buildPdf, buildZip } from "@/lib/export/build";
import { todayKey } from "@/lib/jobs/limits";
import { compareSessionImages } from "@/lib/jobs/order";
import { getKieCredits } from "@/lib/providers";
import { getSettings } from "@/lib/settings";
import { getStorage } from "@/lib/storage";
import { zonedStartOfDay } from "@/lib/time";
import { buildChatMessages, buildSystemPrompt, extractHandoff, type HistoryItem } from "./bot-prompt";
import { ZaloError, type ZaloClient } from "./client";
import { HELP_CUSTOMER, HELP_STAFF, parseCommand, PUBLIC_COMMANDS, type CommandName } from "./commands";
import { getZaloClient } from "./index";
import { getZaloSettings, type ZaloSettings } from "./settings";
import { preview, prepareReply, splitMessage, stripMarkdown } from "./text";

/**
 * Bộ não của Hộp thư Zalo: nhận tin từ webhook, lưu hội thoại, xử lý ghép nối và lệnh gõ nhanh,
 * cho bot AI (kie.ai) trả lời khách, và gửi tin/ảnh/file từ web. Mỗi chức năng có công tắc riêng trong cấu hình Zalo.
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

    const recording = s.inbox || s.chatbot;
    if (!recording && !s.commands && !s.pairing) return;

    await serial(chatId, () => handleIncoming(client, s, ev, isGroup));
  } catch (e) {
    console.error("Zalo webhook: lỗi xử lý tin:", errText(e));
  }
}

async function handleIncoming(client: ZaloClient, s: ZaloSettings, ev: ZaloEvent, isGroup: boolean) {
  const msg = ev.message!;
  const chatId = msg.chat!.id!;
  const { kind, text } = classify(ev);
  const recording = s.inbox || s.chatbot;

  const name = (msg.from?.display_name ?? "").trim().slice(0, 150) || (isGroup ? "Nhóm Zalo" : "Khách Zalo");
  const contact = await db.zaloContact.upsert({
    where: { chatId },
    create: { chatId, chatType: isGroup ? "GROUP" : "PRIVATE", displayName: name },
    update: isGroup ? {} : { displayName: name },
  });

  // Lệnh gõ nhanh / ghép nối (chỉ chat riêng)
  const cmd = kind === "TEXT" && !isGroup ? parseCommand(text) : null;
  const cmdEnabled = cmd && (cmd.name === "pair" ? s.pairing : s.commands);

  let incomingId: string | null = null;
  if (recording && contact.role !== "BLOCKED") {
    incomingId = await recordIncoming(contact.id, msg, kind, text);
    if (incomingId === null) return; // Zalo gửi lại tin đã xử lý: bỏ qua
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

  if (incomingId) {
    await db.zaloContact.update({
      where: { id: contact.id },
      data: { unreadCount: { increment: 1 }, lastMessageAt: new Date(), lastMessageText: preview(text || kindLabel(kind), 200) },
    });
  }

  if (!s.chatbot || contact.botPaused || kind === "STICKER") return;
  if (isGroup && !s.groupReply) return;

  if (kind === "VOICE" || kind === "FILE" || kind === "OTHER" || (kind === "IMAGE" && !s.vision)) {
    await db.zaloContact.update({ where: { id: contact.id }, data: { needsHuman: true } });
    if (kind !== "OTHER") await replyBot(client, contact, [s.unsupportedReply], undefined);
    return;
  }

  await botAnswer(client, s, contact.id, isGroup, msg.photo_url);
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

type SendMeta = { author: "BOT" | "HUMAN" | "SYSTEM"; userId?: string; promptTokens?: number; completionTokens?: number };

/** Gửi lần lượt các đoạn chữ cho một cuộc chat và lưu từng đoạn vào hội thoại. Trả về lỗi đầu tiên nếu có. */
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
          authorUserId: meta.userId ?? null,
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
  if (record) await touch(contactId, chunks[chunks.length - 1] ?? "");
  return firstError;
}

async function touch(contactId: string, lastText: string) {
  await db.zaloContact.update({ where: { id: contactId }, data: { lastMessageAt: new Date(), lastMessageText: preview(lastText, 200) } });
}

async function replySystem(client: ZaloClient, contact: { id: string; chatId: string }, text: string, record: boolean) {
  await sendChunks(client, contact.id, contact.chatId, splitMessage(text), { author: "SYSTEM" }, record);
}

async function replyBot(client: ZaloClient, contact: { id: string; chatId: string }, chunks: string[], usage: { promptTokens: number; completionTokens: number } | undefined) {
  await sendChunks(client, contact.id, contact.chatId, chunks, { author: "BOT", ...usage }, true);
}

/* ---------- Bot AI trả lời ---------- */

async function dayStart(): Promise<Date> {
  return zonedStartOfDay(todayKey(), getEnv().APP_TIMEZONE) ?? new Date(Date.now() - 24 * 3600_000);
}

async function botAnswer(client: ZaloClient, s: ZaloSettings, contactId: string, isGroup: boolean, photoUrl: string | undefined) {
  const contact = await db.zaloContact.findUnique({ where: { id: contactId } });
  if (!contact) return;

  // Hạn mức: toàn hệ thống mỗi ngày, và mỗi người mỗi giờ
  const [today, lastHour] = await Promise.all([
    db.zaloMessage.count({ where: { author: "BOT", direction: "OUT", failed: false, createdAt: { gte: await dayStart() } } }),
    db.zaloMessage.count({ where: { contactId, author: "BOT", direction: "OUT", createdAt: { gte: new Date(Date.now() - 3600_000) } } }),
  ]);
  if (today >= s.botDailyLimit || lastHour >= s.botHourlyLimitPerContact) {
    await db.zaloContact.update({ where: { id: contactId }, data: { needsHuman: true } });
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
        ? db.material.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { code: true, name: true, groupName: true, printTech: true, descHuman: true } })
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
    });

    const result = await getChatProvider().complete({ model: s.chatModel, messages: buildChatMessages(system, history) });
    const { text, handoff } = extractHandoff(result.text);
    const chunks = prepareReply(text);
    const usage = { promptTokens: result.promptTokens, completionTokens: result.completionTokens };

    if (chunks.length > 0) await replyBot(client, contact, chunks, usage);
    if (handoff) {
      await db.zaloContact.update({ where: { id: contactId }, data: { needsHuman: true, botPaused: true } });
      if (chunks.length === 0) await replyBot(client, contact, [s.handoffReply], usage);
    }
  } catch (e) {
    // Bot lỗi (hết token, mạng...): ghi lại cho nhân viên thấy, đánh dấu cần người; khách không bị nhắn lỗi kỹ thuật
    const reason = e instanceof ChatError ? e.message : errText(e);
    console.error("Zalo bot: không trả lời được:", reason);
    await db.zaloMessage.create({
      data: { contactId, direction: "OUT", author: "SYSTEM", kind: "OTHER", text: "Bot không trả lời được tin này.", failed: true, error: reason },
    });
    await db.zaloContact.update({ where: { id: contactId }, data: { needsHuman: true } });
  }
}

/* ---------- Lệnh gõ nhanh và ghép nối ---------- */

async function runCommand(client: ZaloClient, s: ZaloSettings, contact: { id: string; chatId: string; role: string; pairCode: string | null }, name: CommandName, record: boolean) {
  const staff = contact.role === "STAFF";
  const say = (t: string) => replySystem(client, contact, t, record);

  if (name === "pair") {
    if (staff) return say("Tài khoản Zalo này đã được ghép nối rồi.");
    const code = contact.pairCode ?? String(randomInt(1000, 10000));
    await db.zaloContact.update({ where: { id: contact.id }, data: { pairCode: code, pairRequestedAt: new Date() } });
    return say(`Mã ghép nối của bạn là ${code}. Nhờ quản trị viên mở Quản trị > Zalo, đối chiếu đúng mã này rồi bấm "Cho phép". Sau đó gõ /help.`);
  }

  if (!PUBLIC_COMMANDS.has(name) && !staff) {
    return say(s.pairing ? "Lệnh này chỉ dành cho nhân viên đã ghép nối. Gõ /ghepnoi để xin ghép nối." : "Lệnh này chỉ dành cho nhân viên.");
  }

  switch (name) {
    case "help":
      return say(staff ? HELP_STAFF : HELP_CUSTOMER);
    case "reset":
      await db.zaloContact.update({ where: { id: contact.id }, data: { contextResetAt: new Date() } });
      return say("Đã xóa ngữ cảnh, mình bắt đầu lại nhé.");
    case "human":
      await db.zaloContact.update({ where: { id: contact.id }, data: { needsHuman: true, botPaused: true } });
      return say(s.handoffReply);
    case "status":
      return say(await statusText());
    case "today":
      return say(await todayText());
    case "inbox": {
      const [unread, waiting] = await Promise.all([
        db.zaloContact.count({ where: { unreadCount: { gt: 0 }, role: "CUSTOMER" } }),
        db.zaloContact.count({ where: { needsHuman: true, role: "CUSTOMER" } }),
      ]);
      return say(`Hộp thư Zalo: ${unread} hội thoại chưa đọc, ${waiting} đang chờ nhân viên.`);
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

/* ---------- Gửi từ web (nhân viên) ---------- */

export type SendResult = { ok: true } | { ok: false; error: string };

/** Nhân viên trả lời khách từ web. Theo cấu hình, bot tạm dừng ở hội thoại này (tiếp quản). */
export async function sendHumanReply(user: { id: string }, contactId: string, rawText: string): Promise<SendResult> {
  const client = getZaloClient();
  const s = await getZaloSettings();
  if (!client || !s.enabled) return { ok: false, error: "Zalo đang tắt hoặc chưa cấu hình bot." };
  const contact = await db.zaloContact.findUnique({ where: { id: contactId } });
  if (!contact) return { ok: false, error: "Không tìm thấy hội thoại." };
  const chunks = splitMessage(stripMarkdown(rawText));
  if (chunks.length === 0) return { ok: false, error: "Vui lòng nhập nội dung." };

  const err = await serial(contact.chatId, () => sendChunks(client, contact.id, contact.chatId, chunks, { author: "HUMAN", userId: user.id }, true));
  await db.zaloContact.update({
    where: { id: contactId },
    data: { unreadCount: 0, needsHuman: false, ...(s.takeoverOnReply && !err ? { botPaused: true } : {}) },
  });
  return err ? { ok: false, error: err } : { ok: true };
}

export type SessionSendMode = "images" | "pdf" | "zip";

/** Gửi ảnh của một phiên cho khách: từng ảnh, hoặc một file PDF / ZIP. */
export async function sendSessionToContact(user: { id: string }, contactId: string, sessionId: string, mode: SessionSendMode): Promise<SendResult & { sent?: number }> {
  const client = getZaloClient();
  const s = await getZaloSettings();
  if (!client || !s.enabled) return { ok: false, error: "Zalo đang tắt hoặc chưa cấu hình bot." };
  const contact = await db.zaloContact.findUnique({ where: { id: contactId } });
  if (!contact) return { ok: false, error: "Không tìm thấy hội thoại." };
  const session = await db.consultSession.findUnique({
    where: { id: sessionId },
    include: { logo: { include: { brand: { include: { customer: true } } } } },
  });
  if (!session) return { ok: false, error: "Không tìm thấy phiên." };

  const images = await db.generatedImage.findMany({
    where: { sessionId, status: "SUCCESS", retries: { none: {} }, finalPath: { not: null } },
    select: { id: true, finalPath: true, materialId: true, variantIndex: true, createdAt: true, sheet: { select: { sortOrder: true } }, layoutSnapshot: true },
  });
  images.sort(compareSessionImages);
  if (images.length === 0) return { ok: false, error: "Phiên này chưa có ảnh nào tạo xong." };
  if (mode === "images" && images.length > 20) return { ok: false, error: "Phiên có hơn 20 ảnh, hãy gửi dạng PDF hoặc ZIP." };

  const brand = session.logo.brand.name;
  const storage = getStorage();
  const sent = await serial(contact.chatId, async (): Promise<SendResult & { sent?: number }> => {
    try {
      if (mode === "images") {
        let n = 0;
        for (const img of images) {
          const buf = await storage.get(img.finalPath!);
          const snap = img.layoutSnapshot as { title?: string; imageNumber?: number } | null;
          const caption = `${brand}${snap?.imageNumber ? ` · Ảnh ${snap.imageNumber}` : ""}`;
          await client.sendPhoto({ chatId: contact.chatId, image: buf, fileName: `${img.id}.jpg`, caption });
          await db.zaloMessage.create({
            data: { contactId, direction: "OUT", author: "HUMAN", authorUserId: user.id, kind: "IMAGE", text: caption, mediaPath: img.finalPath },
          });
          n++;
          await sleep(600);
        }
        await touch(contactId, `[Đã gửi ${n} ảnh]`);
        return { ok: true, sent: n };
      }
      const bufs = await Promise.all(images.map((i) => storage.get(i.finalPath!)));
      const safe = brand.replace(/[\\/:*?"<>|]+/g, " ").trim() || "mau";
      const fileName = mode === "pdf" ? `${safe} - anh mau.pdf` : `${safe} - anh mau.zip`;
      const data = mode === "pdf" ? await buildPdf(bufs, brand) : buildZip(bufs.map((b, i) => ({ name: `anh-${i + 1}.jpg`, data: b })));
      await client.sendFile({ chatId: contact.chatId, data, fileName, caption: `Ảnh mẫu ${brand}` });
      await db.zaloMessage.create({
        data: { contactId, direction: "OUT", author: "HUMAN", authorUserId: user.id, kind: "FILE", text: `[Đã gửi file ${fileName}]` },
      });
      await touch(contactId, `[Đã gửi file ${fileName}]`);
      return { ok: true, sent: 1 };
    } catch (e) {
      const message = e instanceof ZaloError ? e.message : errText(e);
      await db.zaloMessage.create({
        data: { contactId, direction: "OUT", author: "SYSTEM", kind: "OTHER", text: "Gửi ảnh mẫu không thành công.", failed: true, error: message },
      });
      return { ok: false, error: message };
    }
  });
  if (sent.ok) {
    await db.zaloContact.update({ where: { id: contactId }, data: { unreadCount: 0, needsHuman: false, ...(s.takeoverOnReply ? { botPaused: true } : {}) } });
  }
  return sent;
}

/** AI soạn sẵn một câu trả lời cho nhân viên duyệt rồi mới gửi (không tự gửi). */
export async function draftReply(contactId: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const s = await getZaloSettings();
  if (!s.enabled || !s.aiDraft) return { ok: false, error: "Chức năng AI soạn đang tắt." };
  const contact = await db.zaloContact.findUnique({ where: { id: contactId } });
  if (!contact) return { ok: false, error: "Không tìm thấy hội thoại." };

  const rows = await db.zaloMessage.findMany({
    where: { contactId, failed: false, createdAt: { gt: contact.contextResetAt ?? new Date(0) } },
    orderBy: { createdAt: "desc" },
    take: s.contextMessages,
  });
  if (rows.length === 0) return { ok: false, error: "Chưa có tin nào để soạn trả lời." };
  const [materials, settings] = await Promise.all([
    s.includeMaterials
      ? db.material.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { code: true, name: true, groupName: true, printTech: true, descHuman: true } })
      : Promise.resolve([]),
    getSettings(),
  ]);
  const system =
    buildSystemPrompt({
      botPrompt: s.botPrompt,
      botKnowledge: s.botKnowledge,
      includeMaterials: s.includeMaterials,
      materials,
      workshopName: settings.workshopName,
      contactName: contact.displayName,
      isGroup: contact.chatType === "GROUP",
    }) + "\n\nBạn đang soạn nháp để nhân viên xem và chỉnh trước khi gửi. Chỉ viết đúng nội dung câu trả lời.";
  try {
    const r = await getChatProvider().complete({
      model: s.chatModel,
      messages: buildChatMessages(system, rows.reverse().map((m) => ({ author: m.author, text: m.text ?? "" }))),
    });
    return { ok: true, text: stripMarkdown(extractHandoff(r.text).text) };
  } catch (e) {
    return { ok: false, error: e instanceof ChatError ? e.message : errText(e) };
  }
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
