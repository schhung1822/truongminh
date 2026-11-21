import "server-only";
import { redirect } from "next/navigation";
import { requireUser, type SessionUser } from "@/lib/auth/dal";

/**
 * Phân quyền module Lead Facebook (docs/thiet-ke-module-lead-facebook.md mục 10):
 * - ADMIN: toàn bộ.
 * - MKT: quản lý bài đăng, nhóm, nick của mình, tạo mã kết nối cho mình; xem mọi lead.
 * - SALE: chỉ xem và cập nhật lead được gán cho mình.
 */
export function canManageFb(role: SessionUser["role"]): boolean {
  return role === "ADMIN" || role === "MKT";
}

/** Dùng trong trang và Server Action của phần quản lý (bài đăng, nhóm, kết nối): sale bị đưa về trang Lead. */
export async function requireFbManager(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canManageFb(user.role)) redirect("/fb/leads");
  return user;
}

/** Sale chỉ thấy lead của mình; ADMIN và MKT thấy tất cả. */
export function canViewLead(user: Pick<SessionUser, "id" | "role">, lead: { assignedToId: string | null }): boolean {
  return canManageFb(user.role) || lead.assignedToId === user.id;
}
