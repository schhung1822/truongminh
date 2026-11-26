import "server-only";
import { ThreadType } from "zca-js";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { preview, splitMessage, stripMarkdown } from "../text";
import { personalMessageId } from "./classify";
import { serialChat } from "./ingest";
import { getAccountApi } from "./manager";

/** Gửi tin từ web qua tài khoản Zalo cá nhân sở hữu hội thoại. Mọi hàm trả về lỗi tiếng Việt hoặc null nếu gửi được. */

const GAP_MS = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

type PersonalContact = { id: string; accountId: string | null; threadId: string | null; chatType: string };

function resolve(contact: PersonalContact) {
  if (!contact.accountId || !contact.threadId) return { ok: false, error: "Hội thoại này không thuộc tài khoản Zalo cá nhân." } as const;
  const api = getAccountApi(contact.accountId);
  if (!api) return { ok: false, error: "Tài khoản Zalo này chưa kết nối. Vào Hệ thống > Kết nối > Zalo để kết nối lại." } as const;
  return { ok: true, api, accountId: contact.accountId, threadId: contact.threadId, type: contact.chatType === "GROUP" ? ThreadType.Group : ThreadType.User } as const;
}

/** Ghi tin web vừa gửi. Zalo cũng dội lại tin đó cho bộ nghe (selfListen): nếu bộ nghe lưu trước thì chỉ bổ sung người gửi. */
async function recordSent(
  contactId: string,
  accountId: string,
  msgId: string | undefined,
  userId: string,
  kind: "TEXT" | "IMAGE" | "FILE",
  text: string,
  mediaPath: string | null,
) {
  const zaloMessageId = msgId ? personalMessageId(accountId, msgId) : null;
  try {
    await db.zaloMessage.create({
      data: { contactId, direction: "OUT", author: "HUMAN", authorUserId: userId, kind, text, mediaPath, zaloMessageId },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && zaloMessageId) {
      await db.zaloMessage.updateMany({ where: { zaloMessageId }, data: { authorUserId: userId, ...(mediaPath ? { mediaPath } : {}) } });
    } else throw e;
  }
}

async function touch(contactId: string, lastText: string) {
  await db.zaloContact.update({ where: { id: contactId }, data: { lastMessageAt: new Date(), lastMessageText: preview(lastText, 200), unreadCount: 0 } });
}

async function logFailure(contactId: string, text: string, error: string) {
  await db.zaloMessage.create({ data: { contactId, direction: "OUT", author: "SYSTEM", kind: "OTHER", text, failed: true, error } });
}

export async function sendPersonalText(contact: PersonalContact, userId: string, rawText: string): Promise<string | null> {
  const r = resolve(contact);
  if (!r.ok) return r.error;
  const chunks = splitMessage(stripMarkdown(rawText));
  if (chunks.length === 0) return "Vui lòng nhập nội dung.";
  return serialChat(r.accountId, r.threadId, async () => {
    let firstError: string | null = null;
    for (const [i, chunk] of chunks.entries()) {
      try {
        const res = await r.api.sendMessage(chunk, r.threadId, r.type);
        await recordSent(contact.id, r.accountId, res.message?.msgId != null ? String(res.message.msgId) : undefined, userId, "TEXT", chunk, null);
      } catch (e) {
        firstError ??= errText(e);
        await logFailure(contact.id, "Gửi tin không thành công.", errText(e));
      }
      if (i < chunks.length - 1) await sleep(GAP_MS);
    }
    await touch(contact.id, chunks[chunks.length - 1]);
    return firstError;
  });
}

export type PersonalAttachment = {
  data: Buffer;
  /** tên file kèm đuôi, ví dụ "anh-1.jpg" */
  filename: `${string}.${string}`;
  width?: number;
  height?: number;
  caption?: string;
  /** đường dẫn kho lưu trữ của ảnh (để hiện lại trong hội thoại) */
  mediaPath?: string | null;
  kind: "IMAGE" | "FILE";
};

/** Gửi lần lượt các ảnh hoặc file. Trả về lỗi đầu tiên (các tệp sau vẫn thử gửi). */
export async function sendPersonalAttachments(contact: PersonalContact, userId: string, items: PersonalAttachment[]): Promise<{ sent: number; error: string | null }> {
  const r = resolve(contact);
  if (!r.ok) return { sent: 0, error: r.error };
  return serialChat(r.accountId, r.threadId, async () => {
    let sent = 0;
    let firstError: string | null = null;
    for (const [i, it] of items.entries()) {
      try {
        const res = await r.api.sendMessage(
          {
            msg: it.caption ?? "",
            attachments: { data: it.data, filename: it.filename, metadata: { totalSize: it.data.length, width: it.width, height: it.height } },
          },
          r.threadId,
          r.type,
        );
        const id = res.attachment?.[0]?.msgId ?? res.message?.msgId;
        await recordSent(contact.id, r.accountId, id != null ? String(id) : undefined, userId, it.kind, it.caption || (it.kind === "FILE" ? `[Đã gửi file ${it.filename}]` : ""), it.mediaPath ?? null);
        sent++;
      } catch (e) {
        firstError ??= errText(e);
        await logFailure(contact.id, `Gửi ${it.filename} không thành công.`, errText(e));
      }
      if (i < items.length - 1) await sleep(GAP_MS + 200);
    }
    if (sent > 0) await touch(contact.id, sent === 1 ? (items[0].caption ?? `[Đã gửi ${items[0].filename}]`) : `[Đã gửi ${sent} tệp]`);
    return { sent, error: firstError };
  });
}
