import type { ZaloBotAccess } from "@/generated/prisma/enums";

/**
 * Quyền dùng bot Zalo của một tài khoản web (docs/DECISIONS.md D133). File thuần, dùng được ở cả máy chủ lẫn trình duyệt.
 * Bot luôn chạy dưới quyền của tài khoản web gắn với người ra lệnh (vai trò, khách mình phụ trách, hạn mức ngày); mức ở đây
 * chỉ quyết định người đó được nhờ bot làm tới đâu.
 */

/** Thứ tự hiện trong ô chọn: mức hay dùng nhất đứng trước. */
export const BOT_ACCESS_LEVELS = ["FULL", "LOOKUP", "NONE"] as const satisfies readonly ZaloBotAccess[];

export const BOT_ACCESS_LABELS: Record<ZaloBotAccess, string> = {
  FULL: "Đầy đủ",
  LOOKUP: "Chỉ tra cứu",
  NONE: "Không dùng bot",
};

export const BOT_ACCESS_DESC: Record<ZaloBotAccess, string> = {
  FULL: "Tra cứu và tạo catalog, ảnh thiết kế (tính vào hạn mức ngày của người đó).",
  LOOKUP: "Tìm khách, xem lịch sử, hỏi kỹ thuật, gửi lại ảnh cũ. Không tạo ảnh mới.",
  NONE: "Bot không nhận lệnh của người này, mã ghép nối không dùng được.",
};

export function isBotAccess(v: unknown): v is ZaloBotAccess {
  return (BOT_ACCESS_LEVELS as readonly unknown[]).includes(v);
}

/**
 * Các lệnh của trợ lý tạo ra ảnh MỚI (tốn lượt tạo ảnh, tốn tiền AI): chỉ quyền Đầy đủ mới chạy được. "xac_nhan" chạy việc
 * đang chờ xác nhận, mà việc chờ xác nhận nào cũng là tạo ảnh. Có test đối chiếu danh sách này với lib/zalo/agent/tools.ts.
 */
export const CREATE_TOOLS: ReadonlySet<string> = new Set(["tao_theo_lich_su", "tao_thiet_ke", "tao_catalog", "tao_thiet_ke_tu_catalog", "xac_nhan"]);

/** Tài khoản này có được ra lệnh cho bot không: còn hoạt động và quyền khác "Không dùng bot". */
export function canUseBot(user: { isActive: boolean; zaloBotAccess: ZaloBotAccess } | null | undefined): boolean {
  return !!user && user.isActive && user.zaloBotAccess !== "NONE";
}

/** Với quyền này, trợ lý có được chạy lệnh `tool` không. */
export function toolAllowed(access: ZaloBotAccess, tool: string): boolean {
  if (access === "NONE") return false;
  return access === "FULL" || !CREATE_TOOLS.has(tool);
}
