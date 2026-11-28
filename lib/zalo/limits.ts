/**
 * Giới hạn của Zalo cho một bot ở gói miễn phí (Basic), đọc tại bot.zaloplatforms.com ngày 28/11/2026 (docs/DECISIONS.md D133):
 * mỗi tài khoản tạo tối đa 3 bot; mỗi bot gửi tối đa 3.000 tin mỗi tháng (tin chữ, ảnh, file đều tính 1 tin), tương tác với
 * tối đa 50 người dùng và 3 nhóm chat. Zalo không công bố ngày làm mới hạn mức và cách đếm "người dùng"; con số hệ thống
 * hiện ra là số tự đếm để ước lượng, lỗi 429 của Zalo mới là căn cứ cuối cùng. Gói Pro (hạn mức cao hơn) Zalo ghi "sắp ra mắt".
 * File thuần, dùng được ở cả máy chủ lẫn trình duyệt.
 */
export const ZALO_BASIC_LIMITS = {
  messagesPerMonth: 3000,
  usersPerBot: 50,
  groupsPerBot: 3,
  botsPerAccount: 3,
} as const;

export type UsageLevel = "ok" | "warn" | "full";

/** Mức cảnh báo của một con số so với giới hạn: từ 80% là sắp đầy, từ 100% là đầy. */
export function usageLevel(used: number, limit: number): UsageLevel {
  if (limit <= 0) return "ok";
  if (used >= limit) return "full";
  return used >= limit * 0.8 ? "warn" : "ok";
}
