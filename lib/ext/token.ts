import { randomBytes } from "node:crypto";
import { hashToken } from "@/lib/auth/token";

/**
 * Mã kết nối extension (docs/thiet-ke-module-lead-facebook.md mục 5.10 và 11): ngẫu nhiên 256 bit, chỉ lưu bản băm sha256,
 * hiện cho người dùng đúng một lần lúc tạo, thu hồi được. Tiền tố "tmx_" giúp nhận ra mã khi bị dán nhầm chỗ.
 */
export const EXT_TOKEN_PREFIX = "tmx_";
/** Số ký tự đầu lưu lại để nhận ra mã trong danh sách thiết bị (không đủ để dùng). */
const SHOWN_PREFIX_CHARS = 8;
const TOKEN_LENGTH = EXT_TOKEN_PREFIX.length + 43; // 32 byte base64url = 43 ký tự

export type NewExtToken = { token: string; hash: string; prefix: string };

export function generateExtToken(): NewExtToken {
  const token = EXT_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), prefix: token.slice(0, SHOWN_PREFIX_CHARS) };
}

export function hashExtToken(token: string): string {
  return hashToken(token);
}

/** Lấy mã từ header "Authorization: Bearer <mã>". Sai dạng thì null. */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!m) return null;
  const t = m[1];
  return t.startsWith(EXT_TOKEN_PREFIX) && t.length === TOKEN_LENGTH && /^[A-Za-z0-9_-]+$/.test(t.slice(EXT_TOKEN_PREFIX.length)) ? t : null;
}
