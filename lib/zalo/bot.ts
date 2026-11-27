import "server-only";
import { randomInt } from "node:crypto";
import sharp from "sharp";
import { Prisma, type ZaloContact } from "@/generated/prisma/client";
import { ChatError, getChatProvider } from "@/lib/ai/chat";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { buildPdf, buildZip } from "@/lib/export/build";
import { COUNTED_USAGE, todayKey } from "@/lib/jobs/limits";
import { compareSessionImages } from "@/lib/jobs/order";
import { extractUnknown } from "@/lib/knowledge/rules";
import { prepareKnowledgePrompt, recordKnowledgeUse } from "@/lib/knowledge";
import { getKieCredits } from "@/lib/providers";
import { getStorage } from "@/lib/storage";
import { zonedStartOfDay } from "@/lib/time";
import { handleAgentMessage } from "./agent";
import { resetThreads } from "./agent/thread";
import { buildChatMessages } from "./bot-prompt";
import { ZaloError, type ZaloClient } from "./client";
import { helpText, parseCommand, PUBLIC_COMMANDS, type CommandName } from "./commands";
import { envBotClient, getBotClient, NO_BOT_MESSAGE } from "./index";
import { sendPersonalAttachments, sendPersonalText, type PersonalAttachment } from "./personal/send";
import { getZaloSettings, type ZaloSettings } from "./settings";
import { preview, splitMessage, stripMarkdown } from "./text";
import { toJpeg } from "@/lib/imaging/webp";

/**
 * Bộ não của bot Zalo: nhận tin từ webhook, xử lý ghép nối và lệnh gõ nhanh của nhân viên, chuyển lệnh tag bot cho trợ lý (agent),
 * ghi tin khách vào Hộp thư. Bot KHÔNG tự nói chuyện với khách: nhân viên nói với khách, bot chỉ làm việc khi nhân viên đã ghép nối gọi.
 * Mỗi chức năng có công tắc riêng trong cấu hình Zalo (Quản trị > Zalo).
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

/**
 * Điểm vào duy nhất cho webhook. Không bao giờ ném lỗi ra ngoài (Zalo chỉ cần nhận 200).
 * `botId` = bot vừa nhận tin (null = bot đặt trong .env): nhóm và hội thoại được ghi lại là của bot đó, tin trả lời đi qua đúng bot đó.
 */
export async function processWebhook(ev: ZaloEvent, botId: string | null = null): Promise<void> {
  try {
    const msg = ev.message;
    const chatId = msg?.chat?.id;
    if (!msg || typeof chatId !== "string" || chatId.length === 0 || chatId.length > 100) return;
    if (msg.from?.is_bot) return;

    const client = botId ? await getBotClient(botId) : envBotClient();
    const s = await getZaloSettings();
    if (!client || !s.enabled) return;

    const isGroup = msg.chat?.chat_type === "GROUP";
    if (isGroup) {
      // nhận ra nhóm để admin đặt tên và gửi tin thử (bot gửi ảnh vào nhóm khi nhân viên tag bot ra lệnh)
      const now = new Date();
      await db.zaloGroup.upsert({
        where: { chatId },
        create: { chatId, name: `Nhóm mới (${chatId.slice(0, 6)})`, lastSeenAt: now, botId },
        update: { lastSeenAt: now, botId },
      });
    }

    if (!s.inbox && !s.commands && !s.pairing && !s.agent) return;

    await serial(chatId, () => handleIncoming(client, s, ev, isGroup, botId));
  } catch (e) {
    console.error("Zalo webhook: lỗi xử lý tin:", errText(e));
  }
}

async function handleIncoming(client: ZaloClient, s: ZaloSettings, ev: ZaloEvent, isGroup: boolean, botId: string | null) {
  const msg = ev.message!;
  const chatId = msg.chat!.id!;
  const { kind, text } = classify(ev);
  // Lưu nội dung hội thoại khi Hộp thư bật (để nhân viên xem) hoặc trợ lý nhận lệnh bật (cần nhớ ảnh logo vừa gửi)
  const recording = s.inbox || s.agent;

  const name = (msg.from?.display_name ?? "").trim().slice(0, 150) || (isGroup ? "Nhóm Zalo" : "Khách Zalo");
  const contact = await db.zaloContact.upsert({
    where: { chatId },
    create: { chatId, chatType: isGroup ? "GROUP" : "PRIVATE", displayName: name, botId },
    update: isGroup ? { botId } : { displayName: name, botId }, // bot nhận tin gần nhất là bot của cuộc chat này
  });

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

  // Trợ lý nhận lệnh: nhân viên đã ghép nối tag bot trong nhóm hoặc nhắn riêng. Người khác (khách) chỉ được ghi nhận, bot không trả lời.
  if (s.agent && (await handleAgentMessage({ s, chat: contact, isGroup, senderId: msg.from?.id, kind, text }))) return;

  // Nhân viên đã ghép nối nhắn chữ thường: gợi ý lệnh
  if (contact.role === "STAFF" && !isGroup) {
    if (s.commands && kind === "TEXT") await replySystem(client, contact, "Gõ /help để xem các lệnh.", recording);
    return;
  }

  // Khách nhắn bot: chỉ ghi nhận để nhân viên thấy ở Hộp thư. Bot KHÔNG tự trả lời khách; nhân viên là người nói với khách.
  await db.zaloContact.update({
    where: { id: contact.id },
    data: { lastMessageAt: new Date(), lastMessageText: preview(text || kindLabel(kind), 200) },
  });
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

type SendMeta = { author: "BOT" | "SYSTEM" | "HUMAN"; userId?: string; promptTokens?: number; completionTokens?: number };

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

async function touch(contactId: string, lastText: string) {
  await db.zaloContact.update({ where: { id: contactId }, data: { lastMessageAt: new Date(), lastMessageText: preview(lastText, 200) } });
}

async function replySystem(client: ZaloClient, contact: { id: string; chatId: string }, text: string, record: boolean) {
  await sendChunks(client, contact.id, contact.chatId, splitMessage(text), { author: "SYSTEM" }, record);
}

async function dayStart(): Promise<Date> {
  return zonedStartOfDay(todayKey(), getEnv().APP_TIMEZONE) ?? new Date(Date.now() - 24 * 3600_000);
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

  // Người chưa ghép nối chỉ dùng được /ghepnoi; các lệnh khác bot im lặng (bot không tự nói chuyện với khách)
  if (!PUBLIC_COMMANDS.has(name) && !staff) return;

  switch (name) {
    case "help":
      return say(helpText(s.enabledCommands));
    case "reset":
      await db.zaloContact.update({ where: { id: contact.id }, data: { contextResetAt: new Date() } });
      await resetThreads(contact.chatId, contact.id); // quên luôn các mạch trò chuyện với trợ lý của người này (ở đây và trong các nhóm)
      return say("Đã xóa ngữ cảnh, mình bắt đầu lại nhé.");
    case "status":
      return say(await statusText());
    case "today":
      return say(await todayText());
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
  const rows = await db.usageLog.groupBy({ by: ["userId"], where: { day: todayKey(), ...COUNTED_USAGE }, _count: { _all: true } }); // không tính ảnh lỗi, giống hạn mức
  if (rows.length === 0) return "Hôm nay chưa có lượt tạo ảnh nào.";
  const users = await db.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, name: true } });
  const name = new Map(users.map((u) => [u.id, u.name]));
  const total = rows.reduce((n, r) => n + r._count._all, 0);
  const lines = rows.sort((a, b) => b._count._all - a._count._all).map((r) => `• ${name.get(r.userId) ?? "?"}: ${r._count._all}`);
  return [`Hôm nay: ${total} lượt tạo ảnh`, ...lines].join("\n");
}

/* ---------- Gửi từ web (nhân viên) ---------- */

export type SendResult = { ok: true } | { ok: false; error: string };

/** Nhân viên trả lời khách từ web. */
export async function sendHumanReply(user: { id: string }, contactId: string, rawText: string): Promise<SendResult> {
  const s = await getZaloSettings();
  if (!s.enabled) return { ok: false, error: "Zalo đang tắt." };
  const contact = await db.zaloContact.findUnique({ where: { id: contactId } });
  if (!contact) return { ok: false, error: "Không tìm thấy hội thoại." };
  // hội thoại của tài khoản Zalo cá nhân: gửi qua đúng tài khoản đó (không liên quan bot)
  if (contact.accountId) {
    const error = await sendPersonalText(contact, user.id, rawText);
    return error ? { ok: false, error } : { ok: true };
  }
  const client = await getBotClient(contact.botId);
  if (!client) return { ok: false, error: NO_BOT_MESSAGE };
  const chunks = splitMessage(stripMarkdown(rawText));
  if (chunks.length === 0) return { ok: false, error: "Vui lòng nhập nội dung." };

  const err = await serial(contact.chatId, () => sendChunks(client, contact.id, contact.chatId, chunks, { author: "HUMAN", userId: user.id }, true));
  await db.zaloContact.update({
    where: { id: contactId },
    data: { unreadCount: 0, needsHuman: false },
  });
  return err ? { ok: false, error: err } : { ok: true };
}

export type SessionSendMode = "images" | "pdf" | "zip";

/** Gửi ảnh của một phiên cho khách: từng ảnh, hoặc một file PDF / ZIP. */
export async function sendSessionToContact(user: { id: string }, contactId: string, sessionId: string, mode: SessionSendMode): Promise<SendResult & { sent?: number }> {
  const s = await getZaloSettings();
  if (!s.enabled) return { ok: false, error: "Zalo đang tắt." };
  const contact = await db.zaloContact.findUnique({ where: { id: contactId } });
  if (!contact) return { ok: false, error: "Không tìm thấy hội thoại." };
  const client = contact.accountId ? null : await getBotClient(contact.botId);
  if (!client && !contact.accountId) return { ok: false, error: NO_BOT_MESSAGE };
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

  // hội thoại của tài khoản Zalo cá nhân: gửi ảnh/file qua đúng tài khoản đó
  if (contact.accountId) {
    const bufs = await Promise.all(images.map(async (i) => toJpeg(await storage.get(i.finalPath!)))); // ảnh lưu là WebP; gửi/ZIP/PDF bằng JPEG
    const safe = brand.replace(/[\\/:*?"<>|]+/g, " ").trim() || "mau";
    let items: PersonalAttachment[];
    if (mode === "images") {
      items = await Promise.all(
        bufs.map(async (data, i) => {
          const m = await sharp(data).metadata();
          const snap = images[i].layoutSnapshot as { imageNumber?: number } | null;
          return {
            data,
            filename: `anh-${i + 1}.jpg` as const,
            width: m.width,
            height: m.height,
            caption: `${brand}${snap?.imageNumber ? ` · Ảnh ${snap.imageNumber}` : ""}`,
            mediaPath: images[i].finalPath,
            kind: "IMAGE" as const,
          };
        }),
      );
    } else {
      const data = mode === "pdf" ? await buildPdf(bufs, brand) : buildZip(bufs.map((b, i) => ({ name: `anh-${i + 1}.jpg`, data: b })));
      items = [{ data, filename: mode === "pdf" ? (`${safe} - anh mau.pdf` as const) : (`${safe} - anh mau.zip` as const), kind: "FILE" }];
    }
    const r = await sendPersonalAttachments(contact, user.id, items);
    if (r.sent === 0) return { ok: false, error: r.error ?? "Gửi không thành công." };
    return { ok: true, sent: r.sent };
  }
  if (!client) return { ok: false, error: NO_BOT_MESSAGE };

  const sent = await serial(contact.chatId, async (): Promise<SendResult & { sent?: number }> => {
    try {
      if (mode === "images") {
        let n = 0;
        for (const img of images) {
          const buf = await toJpeg(await storage.get(img.finalPath!));
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
      const bufs = await Promise.all(images.map(async (i) => toJpeg(await storage.get(i.finalPath!)))); // ảnh lưu là WebP; gửi/ZIP/PDF bằng JPEG
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
    await db.zaloContact.update({ where: { id: contactId }, data: { unreadCount: 0, needsHuman: false } });
  }
  return sent;
}

/**
 * AI soạn sẵn một câu trả lời cho nhân viên duyệt rồi mới gửi (không tự gửi).
 * Vai DRAFT_REPLY chỉ được đọc kiến thức CÔNG KHAI (chữ này đi tới khách); thiếu thông tin thì soạn câu "để em kiểm tra" và ghi vào danh sách chưa trả lời được.
 */
export async function draftReply(contactId: string, userId?: string): Promise<{ ok: true; text: string; unknown: boolean } | { ok: false; error: string }> {
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
  const history = rows.reverse();
  const lastCustomer = [...history].reverse().find((m) => m.author === "CONTACT" && m.text)?.text ?? "";

  try {
    const p = await prepareKnowledgePrompt({
      role: "DRAFT_REPLY",
      question: lastCustomer,
      contactName: contact.displayName,
      isGroup: contact.chatType === "GROUP",
    });
    const r = await getChatProvider().complete({
      model: s.chatModel,
      messages: buildChatMessages(p.system, history.map((m) => ({ author: m.author, text: m.text ?? "" }))),
    });
    const { text, unknown } = extractUnknown(r.text);
    await recordKnowledgeUse({ role: "DRAFT_REPLY", question: lastCustomer, usedIds: p.usedIds, droppedIds: p.droppedIds, unknown, userId });
    return { ok: true, text: stripMarkdown(text), unknown };
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
