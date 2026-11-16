import type { ImageStatusValue } from "./view";

/**
 * kie.ai không báo phần trăm tiến độ, nên thanh tiến trình là ƯỚC TÍNH theo thời gian đã chờ:
 * tăng nhanh lúc đầu rồi chậm dần, không bao giờ chạm 100% cho tới khi ảnh thật sự xong.
 */

/** Thời gian chờ điển hình của một ảnh theo độ phân giải (ms), dùng để chỉnh tốc độ của thanh. */
export function expectedDurationMs(resolution: string): number {
  switch (resolution) {
    case "1K":
      return 40_000;
    case "4K":
      return 130_000;
    default:
      return 80_000; // 2K
  }
}

/** Phần trăm ước tính (0 đến 100) cho một ảnh. */
export function estimateProgress(status: ImageStatusValue, ageMs: number, expectedMs: number): number {
  if (status === "SUCCESS" || status === "FAILED") return 100;
  const age = Math.max(0, ageMs);
  if (status === "PENDING") return Math.min(8, (age / 1000) * 2); // đang chuẩn bị, upload ảnh tham chiếu
  // đang tạo: 8% -> tiệm cận 95%
  const p = 8 + 87 * (1 - Math.exp(-age / expectedMs));
  return Math.min(95, p);
}

/** Phần trăm chung của cả phiên = trung bình các ảnh. */
export function overallProgress(percents: number[]): number {
  if (percents.length === 0) return 0;
  return Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
}

/** 83000 -> "1:23" */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
