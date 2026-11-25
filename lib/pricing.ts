import { kieModel } from "@/lib/providers/kie-models";
import type { Resolution } from "@/lib/image-options";

export const USD_PER_CREDIT = 0.005;

/**
 * Ước tính chi phí kie.ai cho một lượt tạo ảnh, theo đúng model đang cấu hình (xem lib/providers/kie-models.ts).
 * `unknown` = true khi model tính phí theo token (ví dụ GPT Image 2.6), không có mức quy đổi credit cố định theo
 * ảnh — lúc đó `credits`/`usd` chỉ tính phần đã biết (model lạ hoặc độ phân giải model không hỗ trợ coi là 0).
 */
export function estimateCost(modelId: string, resolutions: string[]): { credits: number; usd: number; unknown: boolean } {
  const model = kieModel(modelId);
  let credits = 0;
  let unknown = false;
  for (const r of resolutions) {
    const size = model?.sizes.find((s) => s.resolution === (r as Resolution));
    if (!size || size.credits === null) {
      unknown = true;
      continue;
    }
    credits += size.credits;
  }
  return { credits, usd: Math.round(credits * USD_PER_CREDIT * 1000) / 1000, unknown };
}

/** Chuỗi hiện chi phí ước tính, ví dụ "10 token (khoảng $0.05)"; thêm dấu "+" khi có phần tính theo token/không rõ. */
export function formatCostLabel(cost: { credits: number; usd: number; unknown: boolean }): string {
  const approx = cost.unknown ? "+" : "";
  return `${cost.credits}${approx} token (khoảng $${cost.usd.toFixed(2)}${approx})`;
}
