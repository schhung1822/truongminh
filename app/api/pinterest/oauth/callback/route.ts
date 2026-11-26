import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth/dal";
import { encryptSecret } from "@/lib/crypto/secret-box";
import { db } from "@/lib/db";
import { getEnv, getPinterestConfig } from "@/lib/env";
import { exchangeCode, getAccount, PinterestApiError } from "@/lib/pinterest/client";
import { PINTEREST_STATE_COOKIE } from "@/lib/pinterest/oauth-state";

function toAdminError(message: string): NextResponse {
  return NextResponse.redirect(`${getEnv().APP_URL.replace(/\/+$/, "")}/admin/connections/pinterest?error=${encodeURIComponent(message)}`);
}

/** Pinterest chuyển người dùng về đây sau khi họ bấm "Cho phép" (hoặc "Từ chối") ở trang xác nhận quyền. */
export async function GET(req: Request) {
  const admin = await requireAdmin();
  const config = getPinterestConfig();
  if (!config) return toAdminError("Chưa cấu hình PINTEREST_CLIENT_ID/PINTEREST_CLIENT_SECRET trong .env.");

  const sp = new URL(req.url).searchParams;
  const jar = await cookies();
  const expectedState = jar.get(PINTEREST_STATE_COOKIE)?.value;
  jar.delete(PINTEREST_STATE_COOKIE);

  if (sp.get("error")) return toAdminError(`Pinterest từ chối: ${sp.get("error_description") || sp.get("error")}`);
  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state || !expectedState || state !== expectedState) {
    return toAdminError("Liên kết xác nhận không hợp lệ hoặc đã quá 10 phút, hãy bấm Kết nối lại.");
  }

  try {
    const tokens = await exchangeCode({ clientId: config.clientId, clientSecret: config.clientSecret, code, redirectUri: config.redirectUri });
    const info = await getAccount(tokens.access_token);

    await db.pinterestAccount.upsert({
      where: { pinterestUserId: info.id },
      create: {
        pinterestUserId: info.id,
        username: info.username,
        profileImageUrl: info.profile_image ?? null,
        accessTokenEnc: encryptSecret(tokens.access_token),
        refreshTokenEnc: encryptSecret(tokens.refresh_token),
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + tokens.refresh_token_expires_in * 1000),
        scope: tokens.scope,
        connectedById: admin.id,
      },
      update: {
        username: info.username,
        profileImageUrl: info.profile_image ?? null,
        accessTokenEnc: encryptSecret(tokens.access_token),
        refreshTokenEnc: encryptSecret(tokens.refresh_token),
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + tokens.refresh_token_expires_in * 1000),
        scope: tokens.scope,
        connectedById: admin.id,
        lastSyncError: null,
      },
    });
    await logActivity({ actor: admin, action: "PINTEREST_CONNECT", target: `@${info.username}` });
  } catch (e) {
    const message = e instanceof PinterestApiError ? e.message : e instanceof Error ? e.message : "Lỗi không rõ.";
    console.error("Kết nối Pinterest thất bại:", message);
    return toAdminError(`Không kết nối được: ${message}`);
  }

  return NextResponse.redirect(`${getEnv().APP_URL.replace(/\/+$/, "")}/admin/connections/pinterest?connected=1`);
}
