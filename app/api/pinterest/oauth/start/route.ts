import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/dal";
import { generateToken } from "@/lib/auth/token";
import { getEnv, getPinterestConfig } from "@/lib/env";
import { buildAuthorizeUrl } from "@/lib/pinterest/client";
import { PINTEREST_STATE_COOKIE } from "@/lib/pinterest/oauth-state";

/** Bấm "Kết nối Pinterest" ở /admin/pinterest đi vào đây, chuyển sang trang Pinterest để xác nhận quyền. */
export async function GET() {
  await requireAdmin();
  const config = getPinterestConfig();
  if (!config) return new Response("Chưa cấu hình PINTEREST_CLIENT_ID/PINTEREST_CLIENT_SECRET trong .env.", { status: 400 });

  const state = generateToken();
  (await cookies()).set(PINTEREST_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().APP_URL.startsWith("https://"),
    path: "/",
    maxAge: 600, // 10 phút, đủ để làm xong việc xác nhận trên Pinterest
  });
  return NextResponse.redirect(buildAuthorizeUrl({ clientId: config.clientId, redirectUri: config.redirectUri, state, scopes: config.scopes }));
}
