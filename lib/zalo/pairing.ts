/**
 * Ghép nối bằng mã cá nhân (docs/DECISIONS.md D133), phần thuần: đọc mã từ lệnh /ghepnoi, tính việc tạm chặn khi nhập sai,
 * soạn câu hướng dẫn gửi cho nhân viên. Phần đụng CSDL nằm ở lib/zalo/staff.ts.
 *
 * Mỗi tài khoản web có một mã 6 số. Nhân viên nhắn riêng cho bot "/ghepnoi 482913" là tài khoản Zalo đó gắn ngay với tài
 * khoản web của mình, không cần quản trị viên duyệt từng lần, và dùng lại được với mọi bot kết nối sau này.
 */

export const PAIR_CODE_LENGTH = 6;
/** Nhập sai ngần này lần thì bot im với người đó trong PAIR_LOCK_MS (chống dò mã, và khỏi tốn tin trả lời). */
export const PAIR_MAX_FAILS = 5;
export const PAIR_LOCK_MS = 60 * 60_000;

export type PairCodeInput =
  /** gõ /ghepnoi không kèm gì: xin ghép nối kiểu cũ (quản trị viên duyệt bằng mã 4 số) */
  | { kind: "none" }
  /** có gõ gì đó sau lệnh nhưng không phải mã 6 số */
  | { kind: "bad" }
  | { kind: "code"; code: string };

/** Đọc phần sau lệnh /ghepnoi. Cho phép gõ cách quãng hay có gạch: "482 913", "482-913". */
export function readPairCode(args: string): PairCodeInput {
  const raw = args.trim();
  if (!raw) return { kind: "none" };
  const digits = raw.replace(/[\s.\-_]/g, "");
  return new RegExp(`^\\d{${PAIR_CODE_LENGTH}}$`).test(digits) ? { kind: "code", code: digits } : { kind: "bad" };
}

/** Mã quá dễ đoán (sáu số giống nhau, dãy tăng/giảm dần) thì không cấp. */
export function isWeakPairCode(code: string): boolean {
  if (/^(\d)\1+$/.test(code)) return true;
  const steps = new Set<number>();
  for (let i = 1; i < code.length; i++) steps.add((Number(code[i]) - Number(code[i - 1]) + 10) % 10);
  return steps.size === 1 && (steps.has(1) || steps.has(9));
}

/**
 * Tình trạng tạm chặn của một hội thoại. Lần sai gần nhất đã quá PAIR_LOCK_MS thì coi như chưa sai lần nào.
 * `fails` = số lần sai còn tính; `locked` = đang bị chặn (bot không xét mã, không trả lời).
 */
export function pairLock(failCount: number, failAt: Date | null, now: Date): { fails: number; locked: boolean } {
  if (!failAt || failCount <= 0 || now.getTime() - failAt.getTime() >= PAIR_LOCK_MS) return { fails: 0, locked: false };
  return { fails: failCount, locked: failCount >= PAIR_MAX_FAILS };
}

/** Câu hướng dẫn để quản trị viên chép gửi cho nhân viên (qua Zalo, không qua bot). */
export function pairInstruction(code: string, botNames: string[]): string {
  const names = botNames.map((n) => n.trim()).filter(Boolean);
  const where = names.length === 0 ? "bot Zalo của xưởng" : names.length === 1 ? `bot "${names[0]}"` : `từng bot: ${names.map((n) => `"${n}"`).join(", ")}`;
  return `Mở Zalo, vào chat riêng với ${where} rồi nhắn đúng dòng này:\n/ghepnoi ${code}\nBot báo ghép nối xong là dùng được. Mã này là của riêng bạn, đừng gửi vào nhóm.`;
}
