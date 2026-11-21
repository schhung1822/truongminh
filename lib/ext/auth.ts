import "server-only";
import type { FbAccountStatus, Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { createRateLimiter } from "./rate-limit";
import { hashExtToken, parseBearer } from "./token";

/**
 * Xác thực cho /api/ext/*: header `Authorization: Bearer <mã kết nối>`. Mỗi lần gọi đều đọc CSDL, nên thu hồi mã
 * hoặc khoá tài khoản có hiệu lực ngay ở lần gọi kế tiếp. Đường dẫn này không qua đăng nhập bằng cookie (xem proxy.ts).
 */
export type ExtContext = {
  token: { id: string; label: string };
  user: { id: string; name: string; role: Role };
  account: { id: string; displayName: string; profileUrl: string; status: FbAccountStatus };
};

export type ExtErrorCode = "NO_TOKEN" | "INVALID_TOKEN" | "TOKEN_REVOKED" | "USER_DISABLED" | "RATE_LIMITED" | "ACCOUNT_INACTIVE" | "NOT_OWN_POST" | "NOT_FOUND" | "BAD_REQUEST" | "TOO_LARGE";

/** Mỗi mã tối đa 120 lần gọi / phút (extension chỉ hỏi vài chục lần mỗi giờ, quét tuần tự có chờ). */
const perToken = createRateLimiter({ limit: 120, windowMs: 60_000 });
/** Gọi sai mã từ cùng một địa chỉ: tối đa 30 lần / phút, tránh dò mã và tránh dồn tải lên CSDL. */
const failsPerIp = createRateLimiter({ limit: 30, windowMs: 60_000 });

const LAST_SEEN_REFRESH_MS = 30_000;

export function extError(status: number, code: ExtErrorCode, message: string, headers?: Record<string, string>): Response {
  return Response.json({ error: message, code }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function clientIp(request: Request): string {
  const h = request.headers;
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function authenticateExt(request: Request): Promise<{ ok: true; ctx: ExtContext } | { ok: false; response: Response }> {
  const ip = clientIp(request);
  const raw = parseBearer(request.headers.get("authorization"));
  if (!raw) {
    const r = failsPerIp.hit(ip);
    if (!r.ok) return { ok: false, response: extError(429, "RATE_LIMITED", "Quá nhiều yêu cầu, thử lại sau.", { "Retry-After": String(r.retryAfterSec) }) };
    return { ok: false, response: extError(401, "NO_TOKEN", "Thiếu mã kết nối (Authorization: Bearer ...).") };
  }

  const row = await db.extToken.findUnique({
    where: { tokenHash: hashExtToken(raw) },
    include: {
      user: { select: { id: true, name: true, role: true, isActive: true } },
      account: { select: { id: true, displayName: true, profileUrl: true, status: true } },
    },
  });
  if (!row) {
    const r = failsPerIp.hit(ip);
    if (!r.ok) return { ok: false, response: extError(429, "RATE_LIMITED", "Quá nhiều yêu cầu, thử lại sau.", { "Retry-After": String(r.retryAfterSec) }) };
    return { ok: false, response: extError(401, "INVALID_TOKEN", "Mã kết nối không đúng.") };
  }
  if (row.revokedAt) return { ok: false, response: extError(401, "TOKEN_REVOKED", "Mã kết nối đã bị thu hồi.") };
  if (!row.user.isActive) return { ok: false, response: extError(401, "USER_DISABLED", "Tài khoản đã bị khoá.") };

  const limited = perToken.hit(row.id);
  if (!limited.ok) {
    return { ok: false, response: extError(429, "RATE_LIMITED", "Quá nhiều yêu cầu, thử lại sau.", { "Retry-After": String(limited.retryAfterSec) }) };
  }

  const now = Date.now();
  if (!row.lastSeenAt || now - row.lastSeenAt.getTime() > LAST_SEEN_REFRESH_MS) {
    await db.extToken.update({ where: { id: row.id }, data: { lastSeenAt: new Date(now) } });
  }

  return {
    ok: true,
    ctx: {
      token: { id: row.id, label: row.label },
      user: { id: row.user.id, name: row.user.name, role: row.user.role },
      account: row.account,
    },
  };
}
