import type { Resolution } from "@/lib/image-options";

/**
 * Giá tham khảo của kie.ai cho GPT Image 2.5 (cả hai bản flare và sunburst, text-to-image lẫn image-to-image),
 * lấy từ kie.ai/gpt-image-2-5 ngày 16/11/2026: 1K = 6, 2K = 10, 4K = 16 credits mỗi ảnh; 1 credit ≈ 0,005 USD.
 * Giá tính theo ảnh tạo ra, KHÔNG phụ thuộc số ảnh tham chiếu gửi kèm. kie.ai có thể đổi giá, nên đây chỉ là ước tính.
 */
export const KIE_CREDITS_PER_IMAGE: Record<Resolution, number> = { "1K": 6, "2K": 10, "4K": 16 };
export const USD_PER_CREDIT = 0.005;

export function estimateCost(resolutions: string[]): { credits: number; usd: number } {
  const credits = resolutions.reduce((sum, r) => sum + (KIE_CREDITS_PER_IMAGE[r as Resolution] ?? 0), 0);
  return { credits, usd: Math.round(credits * USD_PER_CREDIT * 1000) / 1000 };
}
