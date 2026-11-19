/** Khớp từ khóa trong tin khách nhắn (thuần, có test): trả lời nhanh và từ khóa chuyển nhân viên. */
import { fold } from "./text";

export type QuickReply = { keywords: string; reply: string };

/** "gặp nhân viên, gặp người" hoặc nhiều dòng -> ["gap nhan vien", "gap nguoi"] (đã bỏ dấu, bỏ trùng và trống). */
export function parseKeywords(raw: string): string[] {
  const out = new Set<string>();
  for (const part of raw.split(/[\n,;]+/)) {
    const k = fold(part).replace(/\s+/g, " ").trim();
    if (k) out.add(k);
  }
  return [...out];
}

function normalize(text: string): string {
  return ` ${fold(text).replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
}

/** Tin khách có chứa từ khóa nào không (không phân biệt hoa thường và dấu, khớp cả cụm từ). */
export function containsKeyword(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const t = normalize(text);
  return keywords.some((k) => {
    const n = normalize(k).trim();
    return n.length > 0 && t.includes(` ${n} `);
  });
}

/** Câu trả lời nhanh đầu tiên có từ khóa khớp với tin khách, hoặc null. */
export function findQuickReply(text: string, list: QuickReply[]): QuickReply | null {
  for (const item of list) {
    if (containsKeyword(text, parseKeywords(item.keywords))) return item;
  }
  return null;
}
