/**
 * Phân loại comment (xem docs/thiet-ke-module-lead-facebook.md mục 6.2). Hàm thuần.
 *
 * Thứ tự ưu tiên:
 * 1. Có link ngoài (không phải facebook / zalo.me) hoặc từ khoá quảng cáo -> SPAM (kể cả khi có số, vì thường là quảng cáo bên khác).
 * 2. Tách được số, Zalo hoặc email -> HAS_CONTACT.
 * 3. Có cụm số viết bằng chữ -> QUESTION (không tách được bằng quy tắc, cần người đọc).
 * 4. Từ khoá quan tâm ("ib", "quan tâm", "chấm", dấu "."...) -> INTEREST.
 * 5. Có dấu hỏi hoặc từ khoá hỏi -> QUESTION.
 * 6. Còn lại -> OTHER.
 */
import { DEFAULT_KEYWORDS, type CommentKeywords } from "./keywords";
import { extractContacts, fold, hasContact, type Contacts } from "./phone";

export type CommentCategory = "HAS_CONTACT" | "INTEREST" | "QUESTION" | "SPAM" | "OTHER";

export type Classification = { category: CommentCategory; contacts: Contacts };

/** Link ngoài: có http(s):// hoặc www., trừ facebook.com, fb.com, m.me, zalo.me. */
export function hasExternalLink(text: string): boolean {
  const links = text.match(/(?:https?:\/\/|www\.)[^\s]+/gi) ?? [];
  return links.some((l) => !/^(?:https?:\/\/|www\.)(?:[a-z0-9-]+\.)*(?:facebook\.com|fb\.com|fb\.watch|m\.me|zalo\.me)(?:[/?#]|$)/i.test(l));
}

/** Cụm từ (đã bỏ dấu) có xuất hiện nguyên từ trong chuỗi đã bỏ dấu không. */
function hasPhrase(folded: string, phrase: string): boolean {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`).test(folded);
}

function matchesAny(folded: string, phrases: string[]): boolean {
  return phrases.some((p) => hasPhrase(folded, p));
}

/** Comment chỉ có dấu chấm ("." / ".." / "…") hoặc chữ "chấm" đứng riêng: cách khách "xin ib" quen thuộc. */
function isDotOrCham(text: string): boolean {
  const t = text.trim();
  return /^[.…]+$/.test(t) || /(?<![\p{L}\p{N}])chấm(?![\p{L}\p{N}])/iu.test(t.normalize("NFC"));
}

export function classifyComment(text: string, keywords: CommentKeywords = DEFAULT_KEYWORDS): Classification {
  const contacts = extractContacts(text);
  const folded = fold(text);

  if (hasExternalLink(text) || matchesAny(folded, keywords.spam)) return { category: "SPAM", contacts };
  if (hasContact(contacts)) return { category: "HAS_CONTACT", contacts };
  if (contacts.spelledOut) return { category: "QUESTION", contacts };

  const interestWords = keywords.interest.filter((k) => k !== "cham"); // "chấm" xử lý riêng bên dưới vì "chăm" bỏ dấu cũng thành "cham"
  if (isDotOrCham(text) || matchesAny(folded, interestWords)) return { category: "INTEREST", contacts };

  if (text.includes("?") || text.includes("？") || matchesAny(folded, keywords.question) || /(?<![a-z0-9])co\b[^?.!]{0,60}?\bkhong(?![a-z0-9])/.test(folded)) {
    return { category: "QUESTION", contacts };
  }
  return { category: "OTHER", contacts };
}
