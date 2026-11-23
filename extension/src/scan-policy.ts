import type { ScanJob } from "./types";

export const MIN_COUNT_COVERAGE = 0.95;

/** Chỉ bỏ đọc sâu khi server đã có mốc từ một lần quét đầy đủ và lần này tổng thật sự không đổi. */
export function canSkipFullScan(job: Pick<ScanJob, "reported_comment_count" | "force_full_scan">, currentCount: number | null): boolean {
  return !job.force_full_scan && currentCount !== null && job.reported_comment_count !== null && currentCount === job.reported_comment_count;
}

/** Không coi 10/75 là hoàn tất; cho phép chênh rất nhỏ vì bộ đếm Facebook có thể gồm comment ẩn hoặc vừa bị xóa. */
export function hasReliableCoverage(collected: number, reported: number | null): boolean {
  if (reported === null || reported === 0) return true;
  return collected / reported >= MIN_COUNT_COVERAGE;
}
