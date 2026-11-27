/**
 * Phần thuần của việc "làm theo mẫu khách từng ưng" và quy tắc xác nhận trước khi tốn lượt (docs/DECISIONS.md D129).
 * Không đụng CSDL: nhận dữ liệu lịch sử đã đọc sẵn, xếp hạng chất liệu, lập kế hoạch, viết câu hỏi xác nhận. Có test.
 */

/** Một dấu vết cho thấy khách ưng một chất liệu. */
export type MaterialSignal = {
  materialId: string;
  code: string;
  name: string;
  /** chất liệu còn bật và còn ảnh tham chiếu (không thì không tạo ảnh được) */
  usable: boolean;
  /** design = được chọn làm thiết kế sau khi xem catalog; quote_sent = đã gửi báo giá; quote_won = khách đã chốt */
  source: "design" | "quote_sent" | "quote_won";
  /** đúng logo đang làm (ưu tiên hơn dấu vết ở logo khác của cùng khách) */
  sameLogo: boolean;
  at: number;
};

export type RankedMaterial = { materialId: string; code: string; name: string; score: number; times: number; won: boolean; lastAt: number };

const WEIGHT: Record<MaterialSignal["source"], number> = { design: 1, quote_sent: 2, quote_won: 4 };

/**
 * Xếp hạng chất liệu khách từng ưng: chốt báo giá nặng nhất, rồi gửi báo giá, rồi chọn làm thiết kế; dấu vết ở đúng logo
 * đang làm được cộng thêm. Bằng điểm thì cái gần đây hơn đứng trước. Chất liệu không còn dùng được bị loại.
 */
export function rankMaterials(signals: MaterialSignal[]): RankedMaterial[] {
  const by = new Map<string, RankedMaterial>();
  for (const s of signals) {
    if (!s.usable) continue;
    const cur = by.get(s.materialId) ?? { materialId: s.materialId, code: s.code, name: s.name, score: 0, times: 0, won: false, lastAt: 0 };
    cur.score += WEIGHT[s.source] + (s.sameLogo ? 1 : 0);
    cur.times += 1;
    cur.won ||= s.source === "quote_won";
    cur.lastAt = Math.max(cur.lastAt, s.at);
    by.set(s.materialId, cur);
  }
  return [...by.values()].sort((a, b) => b.score - a.score || b.lastAt - a.lastAt || a.code.localeCompare(b.code));
}

/** Số chất liệu tối đa lấy từ lịch sử cho một lần làm lại (mỗi chất liệu x số phương án = số ảnh, mỗi ảnh một lượt). */
export const HISTORY_MAX_MATERIALS = 4;
/** Khách chưa từng chọn chất liệu nào nhưng có mẫu Pinterest đã thích: nhờ AI chọn ngần này chất liệu hợp logo và mẫu. */
export const HISTORY_AI_MATERIALS = 3;
/** Từ ngần này lượt trở lên thì hỏi xác nhận trước khi tạo, kể cả khi lệnh nói rõ. */
export const CONFIRM_FROM_TASKS = 12;

/**
 * Việc tạo ảnh đã chốt đủ tham số, lưu được vào CSDL để chờ xác nhận rồi chạy đúng như vậy (AI không phải nhắc lại tham số,
 * nên không thể "nhớ nhầm" giữa lúc hỏi và lúc làm).
 */
export type PlanExec =
  | { kind: "catalog_ai"; logoId: string }
  | { kind: "catalog_sheets"; logoId: string; sheetIds: string[] }
  | { kind: "catalog_all"; logoId: string }
  /** logo chưa có trong hệ thống: lấy ảnh vừa gửi trong cuộc chat, tạo khách/thương hiệu/logo lúc chạy */
  | { kind: "catalog_new_logo"; imageMessageId: string; customerName: string; brandName: string; mode: "ai" | "sheets" | "all"; sheetIds: string[] }
  | { kind: "design_catalog"; parentSessionId: string; materialIds: string[]; productType: string; variants: number; note: string }
  | { kind: "design_direct"; logoId: string; materialIds: string[]; pinIds: string[]; productType: string; variants: number; note: string }
  | { kind: "design_pins"; logoId: string; pinIds: string[]; materialCount: number; productType: string; variants: number; note: string };

export type PendingPlan = {
  exec: PlanExec;
  /** câu tả việc sẽ làm, dùng lại khi nhắc người ra lệnh và khi đưa vào bối cảnh cho AI */
  summary: string;
  /** số lượt (tác vụ AI) ước tính */
  tasks: number;
  createdAt: string;
};

/** Việc chờ xác nhận quá lâu thì bỏ: người ra lệnh nhắn "ok" một tiếng sau có thể đang nói chuyện khác. */
export const PENDING_MAX_AGE_MS = 30 * 60_000;

export function pendingAlive(p: PendingPlan | null | undefined, now = Date.now()): p is PendingPlan {
  if (!p) return false;
  const at = Date.parse(p.createdAt);
  return !Number.isNaN(at) && now - at <= PENDING_MAX_AGE_MS;
}

/**
 * Có phải hỏi xác nhận trước khi chạy không. Hỏi khi: kế hoạch do bot tự suy ra từ lịch sử, tạo với TẤT CẢ chất liệu, hoặc
 * tốn từ CONFIRM_FROM_TASKS lượt trở lên. Lệnh nói rõ và tốn ít lượt thì làm luôn.
 */
export function needsConfirm(input: { tasks: number; inferred: boolean; allMaterials?: boolean }): boolean {
  return input.inferred || !!input.allMaterials || input.tasks >= CONFIRM_FROM_TASKS;
}

export type HistoryPlan =
  | { kind: "materials"; materials: RankedMaterial[]; pinIds: string[] }
  | { kind: "pins"; pinIds: string[] }
  | { kind: "none" };

/**
 * Lập kế hoạch "làm theo mẫu khách từng ưng": có chất liệu từng ưng thì thiết kế đúng các chất liệu đó (kèm mẫu Pinterest
 * đã thích làm phong cách, nếu có); chưa có chất liệu nào nhưng có mẫu Pinterest thì nhờ AI chọn chất liệu theo mẫu;
 * không có gì thì không lập được.
 */
export function planFromHistory(ranked: RankedMaterial[], favoritePinIds: string[], maxPins: number): HistoryPlan {
  const pinIds = [...new Set(favoritePinIds)].slice(0, maxPins);
  if (ranked.length > 0) return { kind: "materials", materials: ranked.slice(0, HISTORY_MAX_MATERIALS), pinIds };
  if (pinIds.length > 0) return { kind: "pins", pinIds };
  return { kind: "none" };
}

/** "3 lần", "đã chốt báo giá": lý do một chất liệu được chọn, viết cho người đọc. */
export function whyMaterial(m: RankedMaterial): string {
  return m.won ? "đã chốt báo giá" : `chọn ${m.times} lần`;
}

/** Câu hỏi xác nhận gửi người ra lệnh. */
export function confirmQuestion(p: PendingPlan, quotaLeft: number | null): string {
  const quota = quotaLeft === null ? "" : ` (hôm nay còn ${quotaLeft} lượt)`;
  return `${p.summary}\nTốn khoảng ${p.tasks} lượt tạo ảnh${quota}. Anh/chị nhắn "ok" để em làm, hoặc nói cần đổi gì ạ.`;
}
