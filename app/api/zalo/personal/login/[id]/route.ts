import { apiUser, isResponse, jsonError } from "@/lib/api";
import { abortLogin, getLogin } from "@/lib/zalo/personal/manager";

/** Trạng thái một lượt đăng nhập QR: ảnh QR, đã quét chưa, thành công hay lỗi. Giao diện hỏi lại vài giây một lần. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser({ admin: true });
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const login = getLogin(id);
  if (!login) return jsonError(404, "Không tìm thấy lượt đăng nhập (có thể máy chủ vừa khởi động lại). Hãy bấm thêm tài khoản lại.");
  return Response.json(login, { headers: { "Cache-Control": "no-store" } });
}

/** Hủy lượt đăng nhập đang chờ quét. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser({ admin: true });
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  abortLogin(id);
  return Response.json({ ok: true });
}
