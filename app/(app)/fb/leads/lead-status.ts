/** Dùng chung cho trang (server) và phần tương tác (client). Không đặt trong file "use client". */
export const STATUS_LABEL: Record<string, string> = {
  NEW: "Mới",
  CONTACTED: "Đã liên hệ",
  QUALIFIED: "Có nhu cầu",
  WON: "Chốt đơn",
  LOST: "Mất",
  INVALID: "Không hợp lệ",
};

/** Màu nhẹ cho từng trạng thái, dùng cho ô chọn và nút lọc. */
export const STATUS_TONE: Record<string, string> = {
  NEW: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  CONTACTED: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  QUALIFIED: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  WON: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  LOST: "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  INVALID: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
};

export const PAGE_SIZES = [25, 50, 100] as const;
