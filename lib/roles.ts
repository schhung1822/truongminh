import type { Role } from "@/generated/prisma/enums";

/** Tên vai trò hiển thị cho người dùng. MKT = phòng marketing (module Lead Facebook, D91). */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Quản trị viên",
  MKT: "Marketing",
  SALE: "Sale",
};

/** Vai trò tạo được ở trang Người dùng (quản trị viên chỉ có ở lần cài đặt đầu, không tạo thêm qua web). */
export const ASSIGNABLE_ROLES = ["SALE", "MKT"] as const satisfies readonly Role[];
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}
