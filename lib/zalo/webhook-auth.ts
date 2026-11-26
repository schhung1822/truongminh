import { timingSafeEqual } from "node:crypto";

/** So sánh chuỗi bí mật webhook không để lộ độ khớp qua thời gian xử lý. Chuỗi rỗng hoặc thiếu luôn là sai. */
export function sameSecret(given: string | null | undefined, expected: string | null | undefined): boolean {
  if (!given || !expected) return false;
  const x = Buffer.from(given);
  const y = Buffer.from(expected);
  return x.length === y.length && timingSafeEqual(x, y);
}
