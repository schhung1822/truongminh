import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Kiểm tra "lạc quan": chỉ xem có cookie đăng nhập hay không để chuyển hướng cho nhanh.
// Việc kiểm tra thật (phiên còn hạn, tài khoản còn hoạt động, vai trò) nằm ở lib/auth/dal.ts.
export function proxy(request: NextRequest) {
  const hasCookie = request.cookies.has("sid");
  if (!hasCookie) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Bỏ qua: trang đăng nhập, file tĩnh của Next, favicon. api/ext là đường của Chrome extension, xác thực bằng mã kết nối
  // (Bearer) trong lib/ext/auth.ts chứ không dùng cookie đăng nhập, nên không được chuyển hướng về /login.
  matcher: ["/((?!login|api/webhooks|api/jobs|api/ext|api/zalo/assets|api/healthz|_next/static|_next/image|favicon.ico).*)"],
};
