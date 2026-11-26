import bcrypt from "bcryptjs";

const ROUNDS = 12;
export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt chỉ dùng 72 BYTE đầu của mật khẩu. Tiếng Việt có dấu tốn 2-3 byte mỗi chữ nên phải đếm theo byte, không theo ký tự. */
export const MAX_PASSWORD_BYTES = 72;

/** Kiểm tra một mật khẩu MỚI. Trả về câu báo lỗi cho người dùng, hoặc null nếu hợp lệ. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) return "Mật khẩu quá dài (tối đa 72 ký tự không dấu, ít hơn nếu có dấu tiếng Việt).";
  if (password.trim().length === 0) return "Mật khẩu không được chỉ gồm khoảng trắng.";
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Băm sẵn một mật khẩu giả để thời gian phản hồi khi email không tồn tại gần bằng khi sai mật khẩu.
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummy ??= bcrypt.hash("khong-ton-tai-" + Math.random(), ROUNDS);
  return dummy;
}
