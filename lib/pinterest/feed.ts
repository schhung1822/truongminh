import { fillTemplate } from "@/lib/zalo/caption";

/**
 * Phần tính toán thuần của chức năng "pin mới lưu vào board → bot Zalo gửi vào nhóm" (docs/DECISIONS.md D127).
 * Không đụng CSDL hay mạng, nên trình duyệt (trang cài đặt) và test dùng chung được. Phần chạy thật ở zalo-feed.ts.
 */

/** Việc theo dõi bị ngắt quãng lâu hơn mức này thì pin lưu trong lúc đó không gửi bù nữa. Cũng là hạn chờ của một lượt gửi. */
export const CATCH_UP_MAX_MS = 24 * 60 * 60 * 1000;

/** Gói Trial của Pinterest: 1000 lượt gọi API mỗi ngày cho cả ứng dụng (developers.pinterest.com/docs/reference/rate-limits). */
export const PINTEREST_TRIAL_DAILY_CALLS = 1000;

export const PIN_FEED_INTERVAL_MIN_SEC = 30;
export const PIN_FEED_INTERVAL_MAX_SEC = 3600;
export const DEFAULT_PIN_FEED_INTERVAL_SEC = 120;

/**
 * "Dấu" của một board: số pin + mốc Pinterest ghi lần cuối pin trong board thay đổi. Hai lần hỏi ra cùng một dấu thì
 * board không có gì mới, khỏi tải lại danh sách pin. Mốc thời gian được đổi ra số để hai cách viết cùng một thời điểm
 * (có/không có mili giây, múi giờ) không bị coi là khác nhau.
 */
export function boardStamp(board: { pin_count?: number | null; board_pins_modified_at?: string | null }): string {
  const modified = board.board_pins_modified_at ? Date.parse(board.board_pins_modified_at) : NaN;
  return `${board.pin_count ?? 0}|${Number.isNaN(modified) ? "" : modified}`;
}

/**
 * Pin mới thấy trong board có được gửi vào nhóm không. Chỉ gửi khi board đang được theo dõi LIÊN TỤC: lần xem trước
 * không quá 24 giờ. Chưa xem lần nào, hoặc đã ngừng lâu hơn thế (tắt chức năng, máy chủ nghỉ dài) thì lần này chỉ nhập pin.
 */
export function canAnnounce(lastCheckedAt: Date | null | undefined, now: number = Date.now()): boolean {
  return !!lastCheckedAt && now - lastCheckedAt.getTime() <= CATCH_UP_MAX_MS;
}

/** Số lượt gọi Pinterest mỗi ngày cho việc hỏi định kỳ (mỗi lần hỏi là một lượt gọi, bất kể đang theo dõi mấy board). */
export function dailyPollCalls(intervalSec: number): number {
  return Math.ceil(86_400 / Math.max(1, intervalSec));
}

export function pinUrl(pinterestPinId: string): string {
  return `https://www.pinterest.com/pin/${pinterestPinId}/`;
}

export const DEFAULT_PIN_FEED_CAPTION = "Mẫu mới · {board}";

/** Các chỗ trống dùng được trong chữ đi kèm pin (cho trang cài đặt). */
export const PIN_FEED_PLACEHOLDERS: { key: string; desc: string }[] = [
  { key: "{board}", desc: "tên board trên Pinterest" },
  { key: "{tieu_de}", desc: "tiêu đề của pin (nhiều pin không có)" },
  { key: "{mo_ta}", desc: "mô tả của pin (thường là chữ của trang gốc)" },
  { key: "{link}", desc: "link mở pin trên Pinterest" },
];

export type PinCaptionInput = { boardName: string; title?: string | null; description?: string | null; pinterestPinId: string };

/** Chữ đi kèm ảnh pin gửi vào nhóm. Mẫu trống = chỉ gửi ảnh. Dòng nào không có gì để điền thì tự bỏ. */
export function buildPinCaption(pin: PinCaptionInput, template: string = DEFAULT_PIN_FEED_CAPTION): string {
  return fillTemplate(template, {
    "{board}": pin.boardName.trim(),
    "{tieu_de}": (pin.title ?? "").trim(),
    "{mo_ta}": (pin.description ?? "").trim(),
    "{link}": pinUrl(pin.pinterestPinId),
  });
}
