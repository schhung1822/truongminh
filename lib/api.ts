import "server-only";
import { getSessionUser, type SessionUser } from "@/lib/auth/dal";

export function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/** Cho Route Handler: trả về người dùng, hoặc Response lỗi 401/403 để trả thẳng ra. */
export async function apiUser(opts?: { admin?: boolean }): Promise<SessionUser | Response> {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Bạn chưa đăng nhập hoặc phiên đã hết hạn.");
  if (user.mustChangePassword) return jsonError(403, "Bạn cần đặt mật khẩu mới trước khi dùng tiếp.");
  if (opts?.admin && user.role !== "ADMIN") return jsonError(403, "Chỉ quản trị viên mới có quyền này.");
  return user;
}

export function isResponse(x: unknown): x is Response {
  return x instanceof Response;
}
