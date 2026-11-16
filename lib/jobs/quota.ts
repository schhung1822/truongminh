/** Phép tính hạn mức lượt tạo ảnh mỗi ngày (thuần, dễ kiểm thử). */

export function remainingQuota(limit: number, used: number): number {
  return Math.max(0, limit - used);
}

/**
 * Kiểm tra có đủ lượt để tạo `needed` ảnh không. Trả về lỗi tiếng Việt hoặc null.
 * limit = 0 nghĩa là chặn hoàn toàn (admin đặt 0 để tạm khóa).
 */
export function checkQuota(limit: number, used: number, needed: number): string | null {
  const left = remainingQuota(limit, used);
  if (needed <= left) return null;
  if (left === 0) return `Bạn đã dùng hết ${limit} lượt tạo ảnh hôm nay. Hạn mức sẽ được làm mới vào ngày mai.`;
  return `Bạn chỉ còn ${left} lượt tạo ảnh hôm nay nhưng cần ${needed} lượt. Hãy chọn ít trang hơn.`;
}
