import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Mã hóa chuỗi bí mật (cookie đăng nhập Zalo cá nhân...) trước khi lưu CSDL, bằng AES-256-GCM.
 * Khóa lấy từ ZALO_ACCOUNT_KEY trong .env; nếu chưa đặt thì tự sinh một khóa ngẫu nhiên và lưu ở file
 * <STORAGE_DIR>/.secret-key (nằm ngoài CSDL, nên ai chỉ lấy được CSDL thì không đọc được cookie).
 * Định dạng: "v1:" + base64(iv 12 byte + tag 16 byte + dữ liệu mã hóa).
 */

const PREFIX = "v1:";

function keyFromString(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

/** Khóa mã hóa: từ .env, hoặc file khóa tự sinh. `dir` chỉ để kiểm thử. */
export function loadSecretKey(opts?: { envKey?: string; dir?: string }): Buffer {
  const envKey = opts?.envKey ?? process.env.ZALO_ACCOUNT_KEY;
  if (envKey && envKey.length >= 16) return keyFromString(envKey);
  const dir = opts?.dir ?? path.resolve(process.env.STORAGE_DIR ?? "./storage");
  const file = path.join(dir, ".secret-key");
  if (existsSync(file)) return keyFromString(readFileSync(file, "utf8").trim());
  mkdirSync(dir, { recursive: true });
  const fresh = randomBytes(32).toString("hex");
  writeFileSync(file, fresh, { mode: 0o600 });
  return keyFromString(fresh);
}

export function encryptSecret(plain: string, key: Buffer = loadSecretKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

/** Giải mã; ném lỗi nếu sai khóa hoặc dữ liệu bị sửa. */
export function decryptSecret(boxed: string, key: Buffer = loadSecretKey()): string {
  if (!boxed.startsWith(PREFIX)) throw new Error("Dữ liệu mã hóa không đúng định dạng.");
  const raw = Buffer.from(boxed.slice(PREFIX.length), "base64");
  if (raw.length < 29) throw new Error("Dữ liệu mã hóa bị cắt ngắn.");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  try {
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Không giải mã được (sai khóa mã hóa hoặc dữ liệu bị sửa). Nếu đã đổi ZALO_ACCOUNT_KEY hoặc mất file .secret-key thì cần quét QR đăng nhập lại.");
  }
}
