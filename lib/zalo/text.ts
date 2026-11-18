/** Xử lý chữ gửi qua Zalo: bỏ ký hiệu Markdown (Zalo Bot không hiện Markdown) và cắt tin dài. */

export const ZALO_MAX_TEXT = 2000;

/** Bỏ ký hiệu Markdown để khách không thấy dấu sao, dấu thăng... Giữ nguyên nội dung chữ. */
export function stripMarkdown(input: string): string {
  return (
    input
      .replace(/\r\n/g, "\n")
      // khối code ```...``` giữ phần ruột
      .replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, "$1")
      // ảnh ![alt](url) -> alt, liên kết [chữ](url) -> chữ (url)
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
      // tiêu đề, trích dẫn
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      // gạch đầu dòng -, *, + -> •
      .replace(/^\s*[-*+]\s+/gm, "• ")
      // đậm, nghiêng, gạch ngang, code dòng
      .replace(/\*\*([^*\n]+)\*\*/g, "$1")
      .replace(/__([^_\n]+)__/g, "$1")
      .replace(/~~([^~\n]+)~~/g, "$1")
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1$2")
      .replace(/`([^`\n]+)`/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Cắt tin dài thành các đoạn không quá `max` ký tự (Zalo giới hạn 2000). Ưu tiên cắt ở dòng trống, rồi xuống dòng,
 * rồi dấu cách, cuối cùng mới cắt cứng. Không đoạn nào rỗng.
 */
export function splitMessage(text: string, max = ZALO_MAX_TEXT): string[] {
  const t = text.trim();
  if (!t) return [];
  if (t.length <= max) return [t];

  const out: string[] = [];
  let rest = t;
  while (rest.length > max) {
    const window = rest.slice(0, max + 1);
    let cut = Math.max(window.lastIndexOf("\n\n"), -1);
    if (cut < max * 0.4) cut = window.lastIndexOf("\n");
    if (cut < max * 0.4) cut = window.lastIndexOf(" ");
    if (cut < max * 0.4) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

/** Chuẩn bị câu trả lời của AI để gửi: bỏ Markdown rồi cắt thành các tin. */
export function prepareReply(text: string): string[] {
  return splitMessage(stripMarkdown(text));
}

/** Tên hiển thị gọn cho danh sách (cắt bớt, bỏ xuống dòng). */
export function preview(text: string | null | undefined, max = 120): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
