import type { Role } from "@/generated/prisma/enums";

/** Tên vai trò hiển thị cho người dùng. MKT = phòng marketing (module Lead Facebook, D91). */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Quản trị viên",
  MKT: "Marketing",
  SALE: "Sale",
};

/**
 * Vai trò gán được ở trang Người dùng. Từ D118 gồm cả quản trị viên, để xưởng có hơn một quản trị viên
 * (trước đó quản trị viên chỉ tạo được lúc cài đặt, mất mật khẩu là phải sửa thẳng CSDL).
 */
export const ASSIGNABLE_ROLES = ["SALE", "MKT", "ADMIN"] as const satisfies readonly Role[];
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}
