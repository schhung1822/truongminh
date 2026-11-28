/**
 * Quy tắc của luồng mời nhà sản xuất dùng vật liệu (v1.1 mục 4.1). Hàm thuần để kiểm thử; phần đọc/ghi CSDL ở lib/fb/offers.ts.
 */
const DAY = 24 * 60 * 60 * 1000;

export type ReplyIdentity = { replyAs: "PAGE" } | { replyAs: "ACCOUNT" } | null;

/**
 * Câu mời đứng tên ai (mục 4.1.2 và 4.1.3):
 * - Có fanpage mặc định đang bật, và bài nằm trong nhóm fanpage đã vào (hoặc bài không thuộc nhóm nào): fanpage.
 * - Không dùng được fanpage: theo cấu hình, "account" = nick đã quét bài, "skip" = không soạn câu (null).
 */
export function resolveReplyIdentity(input: { hasDefaultPage: boolean; inGroup: boolean; pageJoined: boolean; fallback: "account" | "skip" }): ReplyIdentity {
  if (input.hasDefaultPage && (!input.inGroup || input.pageJoined)) return { replyAs: "PAGE" };
  return input.fallback === "account" ? { replyAs: "ACCOUNT" } : null;
}

/**
 * Nhà sản xuất này có đang trong thời gian "đã chào, chưa chào lại" không. Tính cả lần chào đã gửi (lastOfferedAt) lẫn dòng
 * chào còn hiệu lực trong hàng chờ (latestOfferQueuedAt: dòng chưa bị bỏ qua / chưa lỗi), để cùng một số điện thoại comment ở
 * bài thứ hai khi câu chào đầu còn chờ duyệt cũng không sinh thêm dòng. cooldownDays = 0 thì không chặn.
 */
export function inOfferCooldown(input: { lastOfferedAt: Date | null; latestOfferQueuedAt: Date | null; now: Date; cooldownDays: number }): boolean {
  if (input.cooldownDays <= 0) return false;
  const since = input.now.getTime() - input.cooldownDays * DAY;
  return [input.lastOfferedAt, input.latestOfferQueuedAt].some((d) => d !== null && d.getTime() >= since);
}

export function cooldownSince(now: Date, cooldownDays: number): Date {
  return new Date(now.getTime() - Math.max(0, cooldownDays) * DAY);
}

/** Đọc cột JSON suggestedMaterialIds của bài: chỉ nhận mảng chuỗi, bỏ trùng, tối đa 12 mã. */
export function parseMaterialIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 60);
  return [...new Set(ids)].slice(0, 12);
}

/**
 * Comment không để lại liên hệ có đáng đưa cho AI xem là xưởng hay không: bỏ comment quá ngắn ("ib", ".", "quan tâm") vì
 * không đủ căn cứ để xếp là nhà sản xuất, và bỏ spam.
 */
export function worthAiCheck(c: { isOwn: boolean; category: string; text: string }): boolean {
  if (c.isOwn || c.category === "SPAM") return false;
  return c.text.replace(/\s+/g, " ").trim().length >= 12;
}

/** Trạng thái của dòng trong hàng chờ còn tính là "đang chào / đã chào" (không tính dòng bị bỏ qua hay lỗi). */
export const LIVE_OFFER_STATUSES = ["DRAFT", "APPROVED", "FILLED", "SENT"] as const;
