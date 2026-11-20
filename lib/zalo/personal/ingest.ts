import "server-only";
import type { API, Message } from "zca-js";
import { ThreadType } from "zca-js";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { preview } from "../text";
import { classifyPersonalContent, personalChatId, personalMessageId } from "./classify";

/**
 * Nhận một tin từ kết nối Zalo cá nhân: tạo hoặc cập nhật hội thoại, lưu tin (kể cả tin chính chủ gõ trên điện thoại),
 * tải ảnh về kho lưu trữ. Tin của cùng một cuộc chat được xử lý lần lượt để không tạo trùng hội thoại.
 */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const g = globalThis as unknown as { __zaloPersonalLocks?: Map<string, Promise<unknown>> };

function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const locks = (g.__zaloPersonalLocks ??= new Map());
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(key, next);
  void next.then(
    () => locks.get(key) === next && locks.delete(key),
    () => locks.get(key) === next && locks.delete(key),
  );
  return next;
}

/** Chạy tác vụ theo hàng đợi riêng của một cuộc chat (dùng cả khi nhân viên gửi tin từ web). */
export function serialChat<T>(accountId: string, threadId: string, fn: () => Promise<T>): Promise<T> {
  return serial(personalChatId(accountId, threadId), fn);
}

async function downloadImage(contactId: string, msgId: string, url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null;
    const key = `zalo/${contactId}/${msgId.replace(/[^\w.-]/g, "_")}.${ext}`;
    await getStorage().put(key, buf);
    return key;
  } catch {
    return null;
  }
}

/** Tên hiển thị của cuộc chat: người thì lấy từ hồ sơ, nhóm thì lấy tên nhóm. Lỗi thì dùng tên tạm theo mã. */
async function lookupThreadName(api: API, threadId: string, isGroup: boolean): Promise<{ name: string; avatar: string | null }> {
  try {
    if (isGroup) {
      const info = (await api.getGroupInfo(threadId)).gridInfoMap?.[threadId];
      if (info?.name) return { name: info.name, avatar: info.avt || null };
    } else {
      const p = (await api.getUserInfo(threadId)).changed_profiles?.[threadId];
      const name = p?.displayName || p?.zaloName;
      if (name) return { name, avatar: p?.avatar || null };
    }
  } catch {
    /* không tra được: dùng tên tạm */
  }
  return { name: isGroup ? `Nhóm ${threadId.slice(-6)}` : `Zalo ${threadId.slice(-6)}`, avatar: null };
}

export async function ingestPersonalMessage(accountId: string, api: API, message: Message): Promise<void> {
  const threadId = message.threadId;
  const isGroup = message.type === ThreadType.Group;
  await serialChat(accountId, threadId, async () => {
    const data = message.data;
    const chatId = personalChatId(accountId, threadId);
    const incoming = !message.isSelf;
    const classified = classifyPersonalContent(data.msgType, data.content);
    const sender = typeof data.dName === "string" ? data.dName.trim() : "";

    let contact = await db.zaloContact.findUnique({ where: { chatId } });
    if (!contact) {
      // người nhắn tới: tên nằm ngay trong tin; tin của chính chủ hoặc tin nhóm thì phải tra hồ sơ
      const looked = incoming && !isGroup && sender ? { name: sender, avatar: null } : await lookupThreadName(api, threadId, isGroup);
      contact = await db.zaloContact.create({
        data: { chatId, chatType: isGroup ? "GROUP" : "PRIVATE", displayName: looked.name.slice(0, 150), accountId, threadId, avatarUrl: looked.avatar },
      });
    }

    const zaloMessageId = personalMessageId(accountId, String(data.msgId));
    const mediaPath = classified.kind === "IMAGE" && classified.mediaUrl ? await downloadImage(contact.id, String(data.msgId), classified.mediaUrl) : null;
    // trong nhóm, ghi tên người nói trước nội dung để biết ai nhắn
    const body = isGroup && incoming && sender && classified.kind === "TEXT" ? `${sender}: ${classified.text}` : classified.text;
    const when = Number(data.ts) > 0 ? new Date(Number(data.ts)) : new Date();

    try {
      await db.zaloMessage.create({
        data: {
          contactId: contact.id,
          direction: incoming ? "IN" : "OUT",
          author: incoming ? "CONTACT" : "HUMAN",
          kind: classified.kind,
          text: body || null,
          mediaPath,
          zaloMessageId,
          createdAt: when,
        },
      });
    } catch (e) {
      // tin đã có (tin do web gửi được Zalo dội lại, hoặc Zalo gửi lại): bỏ qua
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
      throw e;
    }

    await db.zaloContact.update({
      where: { id: contact.id },
      data: {
        lastMessageAt: when,
        lastMessageText: preview(body || (mediaPath ? "[Ảnh]" : ""), 200),
        ...(incoming ? { unreadCount: { increment: 1 } } : {}),
        ...(incoming && !isGroup && sender && contact.displayName.startsWith("Zalo ") ? { displayName: sender.slice(0, 150) } : {}),
      },
    });
  });
}
