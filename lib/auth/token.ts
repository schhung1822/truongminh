import { createHash, randomBytes } from "node:crypto";

/** Token ngẫu nhiên gửi cho trình duyệt (cookie). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** CSDL chỉ lưu bản băm, lộ CSDL cũng không dùng lại được cookie. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
