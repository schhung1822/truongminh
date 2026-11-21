/**
 * TẤT CẢ cách nhận biết phần tử và nhãn trên trang Facebook nằm ở file này. Facebook đổi giao diện thì chỉ sửa ở đây.
 *
 * Nguyên tắc (docs/thiet-ke-module-lead-facebook.md mục 8.5):
 * - KHÔNG dùng tên class (Facebook xáo trộn và đổi liên tục). Dùng thuộc tính role, aria-label, cấu trúc link (tham số comment_id).
 * - Mọi nhãn chữ hỗ trợ cả tiếng Việt lẫn tiếng Anh; so khớp sau khi bỏ dấu và hạ chữ thường.
 * - Mỗi mục có 2-3 cách tìm dự phòng. Không tìm thấy phần tử bắt buộc thì báo selector_broken kèm tên mục, không đoán mò.
 *
 * Các nhãn và cấu trúc dưới đây là ĐỊNH HƯỚNG đã dựng theo hiểu biết về giao diện Facebook, chưa được kiểm trên trang thật
 * trong lúc viết (xem README mục "Chưa kiểm chứng"). Chạy thử trên một bài thật rồi chỉnh tại đây nếu cần.
 */
import { fold } from "../../../lib/fb/phone";

/** Mỗi loại nút chỉ gồm các nút ĐỌC/MỞ RỘNG nội dung. Không có nhãn nào thuộc nút gửi, đăng, trả lời. */
export const LABELS = {
  /** Nút đổi cách sắp xếp bình luận: nhãn hiện tại của nó là một trong các giá trị này. */
  sortButton: [/^(phu hop nhat|most relevant|moi nhat|newest|cu nhat|oldest|tat ca binh luan|all comments)$/],
  /** Mục trong menu sắp xếp để hiện đầy đủ bình luận. */
  allComments: [/^(tat ca binh luan|all comments)$/],
  viewMoreComments: [
    /^xem them( \d+)? binh luan$/,
    /^xem cac binh luan truoc$/,
    /^xem binh luan truoc$/,
    /^view( \d+)? more comments?$/,
    /^view previous comments$/,
    /^view more comments$/,
  ],
  viewReplies: [/^xem( tat ca)?( \d+)? phan hoi$/, /^xem them( \d+)? phan hoi$/, /^view( all)?( \d+)?( more)? repl(y|ies)$/, /^\d+ phan hoi$/, /^\d+ repl(y|ies)$/],
  /** "Xem thêm" mở phần nội dung bị cắt của một bình luận. */
  seeMore: [/^(xem them|see more)$/],
  noComments: [/chua co binh luan nao/, /no comments yet/],
} as const;

export type LabelKind = keyof typeof LABELS;

/** Chuẩn hoá nhãn nút: bỏ dấu, chữ thường, bỏ dấu "…" hoặc "..." đầu chuỗi, gộp khoảng trắng. */
export function normalizeLabel(raw: string): string {
  return fold(raw).replace(/^[\s.…·-]+/, "").replace(/\s+/g, " ").trim();
}

export function labelMatches(raw: string, kind: LabelKind): boolean {
  const t = normalizeLabel(raw);
  return !!t && LABELS[kind].some((re) => re.test(t));
}

export type CommentIds = { fbCommentId: string; parentFbCommentId: string | null };

/**
 * Lấy mã comment từ link thời gian của comment (tham số comment_id; trả lời có thêm reply_comment_id).
 * Comment gốc: comment_id=A. Trả lời: comment_id=A&reply_comment_id=B -> mã là B, cha là A.
 */
export function commentIdsFromHref(href: string, base = "https://www.facebook.com"): CommentIds | null {
  let u: URL;
  try {
    u = new URL(href, base);
  } catch {
    return null;
  }
  const id = u.searchParams.get("comment_id");
  const reply = u.searchParams.get("reply_comment_id");
  const ok = (s: string | null): s is string => !!s && /^[A-Za-z0-9_:.=-]{1,100}$/.test(s);
  if (!ok(id)) return null;
  return ok(reply) ? { fbCommentId: reply, parentFbCommentId: id } : { fbCommentId: id, parentFbCommentId: null };
}

/** Facebook chuyển về trang đăng nhập (hết phiên). */
export function isLoginUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.endsWith("facebook.com") && (/^\/login(\.php|\/|$)/.test(u.pathname) || u.pathname.startsWith("/recover"));
  } catch {
    return false;
  }
}

/** Facebook yêu cầu xác minh / khoá tạm thời nick. */
export function isCheckpointUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.endsWith("facebook.com") && /^\/(checkpoint|two_step_verification|confirmemail)/.test(u.pathname);
  } catch {
    return false;
  }
}

/** "12 bình luận", "1,5K bình luận", "3 comments" -> số; không thấy thì null. Dùng để biết bài có comment mà đọc không ra. */
export function commentCountFromText(text: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*([kKmM])?\s*(?:binh luan|bình luận|comments?)/i.exec(text.normalize("NFC")) ?? /(\d+(?:[.,]\d+)?)\s*([kKmM])?\s*(?:binh luan|comments?)/i.exec(fold(text));
  if (!m) return null;
  let n = parseFloat(m[1].replace(",", "."));
  if (m[2]) n *= m[2].toLowerCase() === "k" ? 1000 : 1_000_000;
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Gộp khoảng trắng, bỏ dòng trống, bỏ các nhãn nút lẫn trong nội dung ("Xem thêm"). */
export function cleanCommentText(raw: string): string {
  return raw
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !labelMatches(l, "seeMore"))
    .join("\n");
}

/** Dạng link trang cá nhân: id số (profile.php?id=...) hay tên đẹp (/ten.ban). Hai dạng khác nhau thì không so link trực tiếp được. */
function profileKind(url: string | null): "id" | "vanity" | "none" {
  if (!url) return "none";
  return /profile\.php\?id=/.test(url) ? "id" : "vanity";
}

/**
 * Comment này do chính nick của mình viết không. So link khi hai bên cùng dạng; khác dạng (trong nhóm Facebook link người viết
 * dùng id số, còn nick có thể lưu link tên đẹp) thì so tên hiển thị. Server cũng tự tính lại theo link khi nhận.
 */
export function isOwnComment(a: { authorUrl: string | null; authorName: string; ownProfileUrl: string; ownDisplayName: string }): boolean {
  const comparable = a.authorUrl !== null && profileKind(a.authorUrl) === profileKind(a.ownProfileUrl);
  if (comparable) return a.authorUrl!.toLowerCase() === a.ownProfileUrl.toLowerCase();
  return !!a.authorName && fold(a.authorName).trim() === fold(a.ownDisplayName).trim();
}
