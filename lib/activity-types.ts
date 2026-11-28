/**
 * Các loại việc được ghi vào Nhật ký hoạt động (bảng activity_logs, docs/DECISIONS.md D118). File này không đụng CSDL
 * nên dùng được ở cả máy chủ lẫn trình duyệt. Thêm loại việc mới: thêm một dòng ở đây rồi gọi logActivity (lib/activity.ts).
 */

export type ActivityGroup = "login" | "account" | "connection";

export const ACTIVITY_GROUPS: { id: ActivityGroup; label: string }[] = [
  { id: "login", label: "Đăng nhập" },
  { id: "account", label: "Tài khoản" },
  { id: "connection", label: "Kết nối" },
];

/** tone: "warn" = việc nên để mắt tới (đăng nhập sai, khóa tài khoản, cấp quyền quản trị...), tô nổi trong bảng. */
export const ACTIVITY = {
  LOGIN: { label: "Đăng nhập", group: "login", tone: "normal" },
  LOGIN_FAILED: { label: "Đăng nhập sai", group: "login", tone: "warn" },
  LOGOUT: { label: "Đăng xuất", group: "login", tone: "normal" },

  PASSWORD_CHANGE: { label: "Tự đổi mật khẩu", group: "account", tone: "normal" },
  PASSWORD_RESET: { label: "Đặt lại mật khẩu cho người khác", group: "account", tone: "warn" },
  SESSIONS_REVOKE: { label: "Đăng xuất khỏi các thiết bị", group: "account", tone: "normal" },
  USER_CREATE: { label: "Tạo tài khoản", group: "account", tone: "normal" },
  USER_UPDATE: { label: "Sửa tên / email", group: "account", tone: "normal" },
  USER_ROLE: { label: "Đổi vai trò", group: "account", tone: "warn" },
  USER_LOCK: { label: "Khóa tài khoản", group: "account", tone: "warn" },
  USER_UNLOCK: { label: "Mở khóa tài khoản", group: "account", tone: "normal" },

  EXT_ACCOUNT_CREATE: { label: "Thêm nick Facebook", group: "connection", tone: "normal" },
  EXT_ACCOUNT_STATUS: { label: "Tạm dừng / bật lại nick Facebook", group: "connection", tone: "normal" },
  EXT_TOKEN_CREATE: { label: "Tạo mã kết nối extension", group: "connection", tone: "normal" },
  EXT_TOKEN_REVOKE: { label: "Thu hồi mã kết nối extension", group: "connection", tone: "warn" },
  ZALO_BOT_ADD: { label: "Thêm bot Zalo", group: "connection", tone: "normal" },
  ZALO_BOT_TOKEN: { label: "Đổi token bot Zalo", group: "connection", tone: "normal" },
  ZALO_BOT_TOGGLE: { label: "Bật / tắt bot Zalo", group: "connection", tone: "normal" },
  ZALO_BOT_REMOVE: { label: "Gỡ bot Zalo", group: "connection", tone: "warn" },
  ZALO_ACCOUNT_REMOVE: { label: "Xóa tài khoản Zalo cá nhân", group: "connection", tone: "warn" },
  ZALO_PAIR: { label: "Ghép nối Zalo với tài khoản", group: "connection", tone: "normal" },
  ZALO_UNPAIR: { label: "Gỡ ghép nối Zalo", group: "connection", tone: "normal" },
  ZALO_BOT_ACCESS: { label: "Đổi quyền dùng bot Zalo", group: "connection", tone: "warn" },
  ZALO_PAIR_CODE: { label: "Đổi mã ghép nối Zalo", group: "connection", tone: "normal" },
  PINTEREST_CONNECT: { label: "Kết nối Pinterest", group: "connection", tone: "normal" },
  PINTEREST_DISCONNECT: { label: "Ngắt kết nối Pinterest", group: "connection", tone: "warn" },
} as const satisfies Record<string, { label: string; group: ActivityGroup; tone: "normal" | "warn" }>;

export type ActivityAction = keyof typeof ACTIVITY;

export function isActivityGroup(v: unknown): v is ActivityGroup {
  return ACTIVITY_GROUPS.some((g) => g.id === v);
}

/** Các mã việc thuộc một nhóm, để lọc trong CSDL. */
export function actionsOfGroup(group: ActivityGroup): ActivityAction[] {
  return (Object.keys(ACTIVITY) as ActivityAction[]).filter((a) => ACTIVITY[a].group === group);
}

/** Nhãn và mức độ của một dòng nhật ký; mã lạ (bản cũ, đã bỏ) vẫn hiện được bằng chính mã đó. */
export function activityInfo(action: string): { label: string; tone: "normal" | "warn" } {
  const known = (ACTIVITY as Record<string, { label: string; tone: "normal" | "warn" }>)[action];
  return known ? { label: known.label, tone: known.tone } : { label: action, tone: "normal" };
}
