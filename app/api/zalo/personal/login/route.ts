import { apiUser, isResponse } from "@/lib/api";
import { startQrLogin } from "@/lib/zalo/personal/manager";

/** Bắt đầu một lượt đăng nhập Zalo cá nhân bằng QR (chỉ quản trị viên). Trả về mã lượt để hỏi trạng thái và lấy ảnh QR. */
export async function POST() {
  const user = await apiUser({ admin: true });
  if (isResponse(user)) return user;
  return Response.json({ id: startQrLogin() }, { headers: { "Cache-Control": "no-store" } });
}
