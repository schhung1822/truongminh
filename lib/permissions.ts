import type { SessionUser } from "@/lib/auth/dal";

/**
 * Quy tắc: ai cũng XEM được dữ liệu của người khác; SALE chỉ SỬA/THÊM vào dữ liệu mình tạo hoặc mình phụ trách;
 * ADMIN toàn quyền.
 */
export function canEditCustomer(
  user: Pick<SessionUser, "id" | "role">,
  customer: { ownerId: string; createdById: string },
): boolean {
  return user.role === "ADMIN" || customer.ownerId === user.id || customer.createdById === user.id;
}

/** Sửa phiên/ảnh: chỉ người tạo hoặc admin. */
export function canEditOwned(user: Pick<SessionUser, "id" | "role">, createdById: string): boolean {
  return user.role === "ADMIN" || createdById === user.id;
}
