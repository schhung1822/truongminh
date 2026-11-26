/**
 * Trạng thái của một phiên "AI chọn chất liệu" (docs/DECISIONS.md D115, D119), lưu ở consult_sessions.aiAnalysis.
 * Việc AI đọc logo mất 30-60 giây nên chạy NỀN sau khi phiên đã được tạo: phiên đi qua ANALYZING rồi thành kết quả
 * (danh sách chất liệu đã chọn) hoặc FAILED kèm lý do. File này chỉ có kiểu và phép đọc thuần, dùng được ở cả máy chủ lẫn
 * trình duyệt và kiểm thử được.
 */

/** Kết quả cuối: nhận xét logo và lý do chọn từng chất liệu. Bản ghi cũ (trước D119) không có `status`. */
export type SessionAiAnalysis = {
  status?: "DONE";
  summary: string;
  isBadge: boolean;
  model: string;
  /** số chất liệu được yêu cầu (cấu hình lúc tạo) */
  requested: number;
  picks: { materialId: string; code: string; name: string; reason: string }[];
  /** phiên "thiết kế theo mẫu Pinterest" (D125): các PinterestPin.id đã chọn làm mẫu */
  pinIds?: string[];
};

/** AI đang phân tích (hoặc sắp phân tích). `decideBadge` giữ lại để lần thử lại làm đúng như lần đầu. */
export type SessionAiPending = { status: "ANALYZING"; startedAt: string; requested: number; decideBadge: boolean; quality?: boolean; pinIds?: string[] };

/** Phân tích không thành: `error` là câu báo cho người dùng. */
export type SessionAiFailed = { status: "FAILED"; error: string; failedAt: string; requested: number; decideBadge: boolean; quality?: boolean; pinIds?: string[] };

export type SessionAiState = SessionAiAnalysis | SessionAiPending | SessionAiFailed;

/**
 * Quá ngần này mà vẫn ANALYZING thì coi như đã hỏng (máy chủ khởi động lại giữa chừng, hoặc việc nền bị ngắt): cho thử lại.
 * Phải lớn hơn trường hợp chậm nhất của việc nền: hai lần hỏi AI, mỗi lần tối đa 120 giây (lib/jobs/auto.ts), cộng thời
 * gian dựng ảnh. Nếu ngắn hơn, việc nền chạy xong sẽ thấy phiên "đã hỏng" và không tạo ảnh nữa.
 */
export const AI_STALE_MS = 6 * 60_000;

export const AI_STALE_MESSAGE = "AI phân tích quá lâu hoặc máy chủ vừa khởi động lại giữa chừng nên việc này bị dở.";

export type AiStateView =
  | { kind: "none" }
  | { kind: "analyzing"; startedAt: number; requested: number; decideBadge: boolean; quality: boolean; pinIds: string[] }
  | { kind: "failed"; error: string; requested: number; decideBadge: boolean; quality: boolean; pinIds: string[] }
  | { kind: "done"; analysis: SessionAiAnalysis };

/** Các pin Pinterest ghi trong cột aiAnalysis (phiên thiết kế theo mẫu, D125); dữ liệu lạ thì coi như không có. */
export function readPinIds(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const ids = (raw as { pinIds?: unknown }).pinIds;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

/** Đọc cột aiAnalysis (JSON bất kỳ) thành một trạng thái rõ ràng. Dữ liệu lạ thì coi như không phải phiên AI. */
export function readAiState(raw: unknown, now = Date.now()): AiStateView {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { kind: "none" };
  const o = raw as Record<string, unknown>;
  const requested = typeof o.requested === "number" ? o.requested : 0;
  const decideBadge = o.decideBadge === true;
  const quality = o.quality === true; // chế độ chất lượng cao (D120), giữ lại để lần thử lại làm đúng như lần đầu
  const pinIds = readPinIds(raw);

  if (o.status === "ANALYZING") {
    const startedAt = typeof o.startedAt === "string" ? Date.parse(o.startedAt) : Number.NaN;
    if (Number.isNaN(startedAt) || now - startedAt > AI_STALE_MS) return { kind: "failed", error: AI_STALE_MESSAGE, requested, decideBadge, quality, pinIds };
    return { kind: "analyzing", startedAt, requested, decideBadge, quality, pinIds };
  }
  if (o.status === "FAILED") {
    return { kind: "failed", error: typeof o.error === "string" && o.error ? o.error : "AI chưa phân tích được logo này.", requested, decideBadge, quality, pinIds };
  }
  if (Array.isArray(o.picks)) return { kind: "done", analysis: raw as SessionAiAnalysis };
  return { kind: "none" };
}
