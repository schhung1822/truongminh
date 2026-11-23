/**
 * TẤT CẢ cách nhận biết phần tử và nhãn trên trang Facebook nằm ở file này. Facebook đổi giao diện thì chỉ sửa ở đây.
 *
 * Nguyên tắc (docs/thiet-ke-module-lead-facebook.md mục 8.5):
 * - KHÔNG dùng tên class (Facebook xáo trộn và đổi liên tục). Dùng thuộc tính role, aria-label, cấu trúc link (tham số comment_id).
 * - Mọi nhãn chữ hỗ trợ cả tiếng Việt lẫn tiếng Anh; so khớp sau khi bỏ dấu và hạ chữ thường.
 * - Mỗi mục có 2-3 cách tìm dự phòng. Không tìm thấy phần tử bắt buộc thì báo selector_broken kèm tên mục, không đoán mò.
 *
 * Các nhãn và cấu trúc dưới đây đã dựng theo hiểu biết về giao diện Facebook và đã chạy trên trang HTML mô phỏng; chưa kiểm
 * trên trang thật trong lúc viết. Nút "Chẩn đoán trang này" của extension cho ra báo cáo để chỉnh file này cho đúng.
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
    /^xem( \d+)? (cac )?binh luan truoc$/,
    /^xem binh luan truoc$/,
    /^view( \d+)? more comments?$/,
    /^view previous comments$/,
    /^view( \d+)? previous comments?$/,
    /^see more comments$/,
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

/**
 * Nhãn có khớp loại nút không. Thử cả chuỗi và riêng DÒNG ĐẦU: nhiều nút của Facebook có dòng mô tả phụ bên dưới
 * ("Tất cả bình luận" + "Hiển thị tất cả bình luận, kể cả...") nên so cả chuỗi sẽ trượt.
 */
export function labelMatches(raw: string, kind: LabelKind): boolean {
  const whole = normalizeLabel(raw);
  if (!whole) return false;
  const first = normalizeLabel(raw.split(/\r?\n/).find((l) => l.trim()) ?? "");
  return LABELS[kind].some((re) => re.test(whole) || (!!first && re.test(first)));
}

/** Dòng chữ chỉ là nhãn giao diện quanh một bình luận (nút, huy hiệu, số đếm), không phải nội dung người viết. */
const UI_NOISE = [
  /^(thich|like|phan hoi|reply|chia se|share|an|hide|xoa|delete|chinh sua|edit)$/,
  /^(da chinh sua|edited|tac gia|author|quan tri vien|admin|nguoi kiem duyet|moderator|top fan|fan cung|nguoi dong gop nhieu nhat|top contributor|dang theo doi|following)$/,
  /^(xem ban dich|see translation|xem them|see more|an bot|see less)$/,
  /^\d+$/,
  /^[·•.]+$/,
];

export function isUiNoise(line: string): boolean {
  const t = normalizeLabel(line);
  return !t || UI_NOISE.some((re) => re.test(t)) || looksLikeRelativeTime(line);
}

/** "2 giờ", "5 phút", "3 ngày", "1 tuần", "2h", "5m", "Vừa xong", "Just now", "Hôm qua"... */
export function looksLikeRelativeTime(text: string): boolean {
  const t = normalizeLabel(text).replace(/\s+(truoc|ago)$/, "");
  if (!t) return false;
  if (/^(vua xong|just now|now|hom qua|yesterday)$/.test(t)) return true;
  return /^\d+\s*(giay|phut|gio|ngay|tuan|thang|nam|s|m|h|d|w|y|mo|yr|sec|min|hr|hrs|mins|secs|day|days|week|weeks|hour|hours|minute|minutes|month|months|year|years)$/.test(t);
}

/** aria-label của một bình luận: "Bình luận của X", "Phản hồi của X", "Comment by X", "Reply by X". Trả về tên X hoặc null. */
export function authorFromCommentLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const m = /^(?:bình luận của|phản hồi của|trả lời của|comment by|reply by)\s+(.+)$/iu.exec(label.normalize("NFC").trim());
  if (!m) return null;
  // Facebook có thể nối thêm " 2 giờ trước" hoặc trạng thái sau tên; cắt ở dấu ngăn thường gặp
  return m[1].split(/\s[·•]\s|\s{2,}/)[0].trim().slice(0, 200) || null;
}

export function isCommentLabel(label: string | null | undefined): boolean {
  return authorFromCommentLabel(label) !== null;
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

/**
 * Mã tạm cho comment khi trang không có link thời gian kèm comment_id: băm (người viết + nội dung) thành chuỗi ngắn, ổn định
 * qua các lần quét. Nhược điểm: comment bị sửa chữ sẽ thành mã mới (một dòng trùng), chấp nhận được vì lead vẫn gộp theo số.
 * Có tiền tố "h" để nhận ra là mã tạm.
 */
export function fallbackCommentId(seed: string): string {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = (h1 * 33) ^ c;
    h2 = (h2 * 33) ^ c;
    h1 >>>= 0;
    h2 >>>= 0;
  }
  return `h${h1.toString(36)}${h2.toString(36)}`;
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

/** Gộp khoảng trắng, bỏ dòng trống, bỏ các nhãn giao diện lẫn trong nội dung ("Xem thêm", "Thích", "2 giờ", "Tác giả"...). */
export function cleanCommentText(raw: string): string {
  return raw
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !isUiNoise(l))
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

/** Mẫu đường link để đưa vào báo cáo chẩn đoán: giữ host và đường dẫn, thay mọi dãy số và mã dài bằng "#", bỏ tham số theo dõi. */
export function linkPattern(href: string): string {
  try {
    const u = new URL(href, "https://www.facebook.com");
    const path = u.pathname.replace(/\d{4,}/g, "#").replace(/pfbid[A-Za-z0-9]+/g, "pfbid#").replace(/[A-Za-z0-9_-]{20,}/g, "#");
    const keys = [...u.searchParams.keys()].filter((k) => !k.startsWith("__")).sort();
    return `${u.hostname}${path}${keys.length ? "?" + keys.join("&") : ""}`;
  } catch {
    return "(link lỗi)";
  }
}
