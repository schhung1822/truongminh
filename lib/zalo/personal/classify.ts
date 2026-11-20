/**
 * Phân loại nội dung tin của Zalo cá nhân (thư viện zca-js) thành loại tin và chữ hiển thị trong Hộp thư.
 * Phép tính thuần, không phụ thuộc thư viện.
 */

export type PersonalKind = "TEXT" | "IMAGE" | "FILE" | "VOICE" | "STICKER" | "OTHER";

export type ClassifiedContent = {
  kind: PersonalKind;
  /** chữ hiển thị trong hội thoại (tin chữ: chính nội dung; tin khác: chú thích hoặc nhãn kiểu "[Sticker]") */
  text: string;
  /** địa chỉ tải ảnh, chỉ có với tin ảnh */
  mediaUrl: string | null;
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** `msgType` là kiểu tin Zalo ("webchat", "chat.photo", "chat.sticker"...), `content` là chữ hoặc một đối tượng đính kèm. */
export function classifyPersonalContent(msgType: string, content: unknown): ClassifiedContent {
  if (typeof content === "string") return { kind: "TEXT", text: content, mediaUrl: null };

  const c = (content && typeof content === "object" ? content : {}) as Record<string, unknown>;
  const type = (msgType ?? "").toLowerCase();
  const title = str(c.title);
  const description = str(c.description);
  const href = str(c.href);

  if (type.includes("photo") || type.includes("image")) {
    return { kind: "IMAGE", text: title || description, mediaUrl: /^https:\/\//i.test(href) ? href : null };
  }
  if (type.includes("sticker")) return { kind: "STICKER", text: "[Sticker]", mediaUrl: null };
  if (type.includes("voice")) return { kind: "VOICE", text: "[Tin nhắn thoại]", mediaUrl: null };
  if (type.includes("video")) return { kind: "OTHER", text: "[Video]", mediaUrl: null };
  if (type.includes("file")) return { kind: "FILE", text: title ? `[File: ${title}]` : "[File]", mediaUrl: null };

  // liên kết, danh thiếp, tin hệ thống...: lấy tiêu đề, mô tả và đường dẫn nếu có
  const parts = [title, description, href].filter(Boolean);
  if (parts.length > 0) return { kind: "TEXT", text: [...new Set(parts)].join("\n"), mediaUrl: null };
  return { kind: "OTHER", text: "[Tin nhắn chưa hiển thị được]", mediaUrl: null };
}

/** Mã hội thoại lưu trong CSDL: tách khỏi chatId của bot Zalo (cột chatId là duy nhất toàn hệ thống). */
export function personalChatId(accountId: string, threadId: string): string {
  return `p:${accountId}:${threadId}`;
}

/** Mã tin lưu trong CSDL (cột zaloMessageId là duy nhất), để một tin không bị lưu hai lần. */
export function personalMessageId(accountId: string, msgId: string): string {
  return `p:${accountId}:${msgId}`;
}
