import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { db } from "@/lib/db";
import type { PinterestAccount } from "@/generated/prisma/client";
import { isPinterestAuthError, refreshAccessToken } from "./client";
import type { PinterestConfig } from "@/lib/env";

// Làm mới sớm hơn hạn thật để không bị lỗi giữa lúc dùng; access_token còn hạn 30 ngày nên mốc 1 ngày là an toàn.
const REFRESH_BEFORE_MS = 24 * 60 * 60 * 1000;

/** Lưu token mới (lần kết nối đầu hoặc sau khi làm mới) — refresh_token Pinterest trả về mỗi lần đều là bản MỚI. */
export async function saveTokens(
  accountId: string,
  tokens: { access_token: string; refresh_token: string; expires_in: number; refresh_token_expires_in: number; scope: string },
): Promise<void> {
  await db.pinterestAccount.update({
    where: { id: accountId },
    data: {
      accessTokenEnc: encryptSecret(tokens.access_token),
      refreshTokenEnc: encryptSecret(tokens.refresh_token),
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      refreshTokenExpiresAt: new Date(Date.now() + tokens.refresh_token_expires_in * 1000),
      scope: tokens.scope,
    },
  });
}

/**
 * Access token còn dùng được của tài khoản đã kết nối, tự làm mới nếu gần hết hạn hoặc bị Pinterest báo 401.
 * Báo lỗi rõ ràng (tiếng Việt) khi refresh_token cũng đã hết hạn — phải kết nối lại từ đầu (quét OAuth lại).
 */
export async function getValidAccessToken(account: PinterestAccount, config: PinterestConfig): Promise<string> {
  if (account.refreshTokenExpiresAt.getTime() <= Date.now()) {
    throw new Error("Phiên kết nối Pinterest đã hết hạn (quá 60 ngày không làm mới). Hãy kết nối lại tài khoản Pinterest.");
  }
  const needsRefresh = account.accessTokenExpiresAt.getTime() - Date.now() < REFRESH_BEFORE_MS;
  if (!needsRefresh) return decryptSecret(account.accessTokenEnc);

  const fresh = await refreshAccessToken({ clientId: config.clientId, clientSecret: config.clientSecret, refreshToken: decryptSecret(account.refreshTokenEnc) });
  await saveTokens(account.id, fresh);
  return fresh.access_token;
}

async function loadCurrentAccount(accountId: string): Promise<PinterestAccount> {
  const account = await db.pinterestAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("Tài khoản Pinterest đã bị ngắt kết nối.");
  return account;
}

/** Gọi lại một lần với token mới nếu Pinterest báo 401 (token vừa hết hạn giữa lúc dùng, hiếm nhưng có thể xảy ra). */
export async function withAutoRefresh<T>(account: PinterestAccount, config: PinterestConfig, run: (accessToken: string) => Promise<T>): Promise<T> {
  // Mỗi lần gọi phải đọc bản mới nhất trong CSDL. Một lượt đồng bộ có thể làm mới token ở lúc đọc board;
  // nếu tiếp tục dùng object `account` cũ để đọc từng board, refresh_token cũ đã bị Pinterest thu hồi sẽ làm lượt sau lỗi.
  const current = await loadCurrentAccount(account.id);
  const token = await getValidAccessToken(current, config);
  try {
    return await run(token);
  } catch (e) {
    if (!isPinterestAuthError(e)) throw e;
    const latest = await loadCurrentAccount(account.id);
    if (latest.refreshTokenExpiresAt.getTime() <= Date.now()) {
      throw new Error("Phiên kết nối Pinterest đã hết hạn. Hãy kết nối lại tài khoản Pinterest.");
    }
    const fresh = await refreshAccessToken({ clientId: config.clientId, clientSecret: config.clientSecret, refreshToken: decryptSecret(latest.refreshTokenEnc) });
    await saveTokens(latest.id, fresh);
    return run(fresh.access_token);
  }
}
