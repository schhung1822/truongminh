import type { ChatMessage } from "@/lib/ai/chat";

/**
 * Ghép lịch sử hội thoại thành tin nhắn gửi AI. Prompt hệ thống và kiến thức không nằm ở đây
 * mà đến từ kho kiến thức (lib/knowledge), để mọi AI dùng chung một nguồn.
 */

export type HistoryItem = { author: "CONTACT" | "BOT" | "HUMAN" | "SYSTEM"; text: string; imageUrl?: string };

/**
 * Đổi lịch sử hội thoại (cũ → mới) thành tin nhắn gửi AI: khách là "user", bot và nhân viên là "assistant".
 * Gộp các tin liên tiếp cùng vai, bắt đầu bằng tin của khách, bỏ tin hệ thống.
 */
export function buildChatMessages(system: string, history: HistoryItem[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: [{ type: "text", text: system }] }];
  for (const h of history) {
    if (h.author === "SYSTEM") continue;
    const role = h.author === "CONTACT" ? "user" : "assistant";
    const parts: ChatMessage["content"] = [];
    if (h.text.trim()) parts.push({ type: "text", text: h.text });
    if (h.imageUrl && role === "user") parts.push({ type: "image_url", image_url: { url: h.imageUrl } });
    if (parts.length === 0) continue;
    const prev = out[out.length - 1];
    if (prev.role === role) prev.content.push(...parts);
    else if (role === "user" || out.length > 1) out.push({ role, content: parts });
    // tin assistant đứng đầu (chưa có tin khách) thì bỏ
  }
  return out;
}
