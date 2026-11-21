/**
 * Tách số điện thoại, Zalo, email từ nội dung comment (xem docs/thiet-ke-module-lead-facebook.md mục 6.1).
 * Hàm thuần, không phụ thuộc CSDL hay mạng.
 *
 * Quy tắc:
 * 1. Bỏ dấu chấm, cách, gạch giữa các chữ số; đổi +84 / 84 / 0084 đầu số thành 0.
 * 2. Chữ giả số (o/O -> 0, l/I -> 1) chỉ đổi khi nằm trong cụm có ít nhất 7 chữ số thật.
 * 3. Số di động Việt Nam hợp lệ: đúng 10 chữ số, bắt đầu 03, 05, 07, 08, 09.
 * 4. Số viết bằng chữ ("không chín một hai...") KHÔNG tách bằng quy tắc, chỉ báo `spelledOut` để người đọc.
 * 5. Tách thêm email và số đứng sau chữ "zalo".
 */

export type Contacts = {
  /** Số di động đã chuẩn hoá (0xxxxxxxxx), theo thứ tự xuất hiện, không trùng. Gồm cả số đứng sau chữ "zalo". */
  phones: string[];
  /** Số đứng ngay sau chữ "zalo" hoặc trong link zalo.me (đã chuẩn hoá), nếu có. */
  zalo: string | null;
  emails: string[];
  /** Có cụm số viết bằng chữ dài như số điện thoại (không tách được, cần người đọc). */
  spelledOut: boolean;
};

const VN_MOBILE = /^0[35789]\d{8}$/;

/** Chuỗi chỉ gồm chữ số (đã bỏ ký tự phân cách) -> số di động chuẩn hoá, hoặc null. */
function toLocal(digits: string): string | null {
  let d = digits;
  if (d.startsWith("0084")) d = "0" + d.slice(4);
  else if (d.startsWith("840") && d.length === 12) d = d.slice(2); // +84 (0)912...
  else if (d.startsWith("84") && d.length === 11) d = "0" + d.slice(2);
  return VN_MOBILE.test(d) ? d : null;
}

/** Ký tự "giống số" được chấp nhận trong một cụm: chữ số thật và o O l I. */
const LIKE = "0-9oOlI";
/** Ký tự phân cách cho phép nằm giữa các chữ số của một số điện thoại. */
const SEP = " .\\-_()";
/**
 * Một cụm ứng viên: bắt đầu và kết thúc bằng ký tự giống số, ở giữa được chen ký tự phân cách,
 * và không dính liền với chữ cái hay chữ số khác ("hello0912..." không tính).
 */
const CANDIDATE_SRC = `(?<![A-Za-z0-9])\\+?[${LIKE}](?:[${LIKE}${SEP}]*[${LIKE}])?(?![A-Za-z0-9])`;

/** Từ một cụm ứng viên, lấy ra các số điện thoại hợp lệ (có thể có nhiều số cách nhau bằng " - "). */
function phonesFromCandidate(candidate: string): string[] {
  const trueDigits = (candidate.match(/[0-9]/g) ?? []).length;
  if (trueDigits < 7) return []; // quy tắc 2: chữ giả số chỉ đổi khi cụm có >= 7 chữ số thật
  const groups = candidate
    .replace(/^\+/, "")
    .split(new RegExp(`[${SEP}]+`))
    .filter(Boolean)
    .map((g) => g.replace(/[oO]/g, "0").replace(/[lI]/g, "1"));
  const out: string[] = [];
  let i = 0;
  while (i < groups.length) {
    let acc = "";
    let matched = false;
    for (let j = i; j < groups.length; j++) {
      acc += groups[j];
      if (acc.length > 13) break;
      const p = toLocal(acc);
      if (p) {
        out.push(p);
        i = j + 1;
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }
  return out;
}

/** Chuẩn hoá MỘT giá trị số điện thoại (ví dụ trường phone của khách hàng). Không hợp lệ thì null. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !new RegExp(`^\\+?[${LIKE}${SEP}]+$`).test(trimmed)) return null;
  const found = phonesFromCandidate(trimmed);
  return found.length === 1 ? found[0] : null;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const ZALO_WORD_RE = /(?<![A-Za-z])(?:zalo|zl)(?![A-Za-z])\s*[:\-.=]?\s*/gi;
const ZALO_LINK_RE = /zalo\.me\/(\+?[0-9]{9,13})(?![0-9])/gi;

const DIGIT_WORDS = new Set(["khong", "mot", "hai", "ba", "bon", "tu", "nam", "lam", "sau", "bay", "tam", "chin", "linh", "le", "zero"]);

/** Bỏ dấu tiếng Việt và hạ chữ thường (dùng để so khớp từ khoá). */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

/** Có một dãy từ chỉ chữ số liên tiếp đủ dài để là số điện thoại viết bằng chữ không. */
function hasSpelledOutNumber(text: string): boolean {
  const tokens = fold(text).split(/[^a-z0-9]+/).filter(Boolean);
  let run = 0;
  for (const t of tokens) {
    if (DIGIT_WORDS.has(t)) {
      run++;
      if (run >= 7) return true;
    } else if (/^[0-9]$/.test(t)) {
      // chữ số lẻ xen giữa các từ ("không chín 1 hai") vẫn tính vào dãy
      run++;
      if (run >= 7) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

export function extractContacts(text: string): Contacts {
  const phones: string[] = [];
  const add = (p: string | null | undefined) => {
    if (p && !phones.includes(p)) phones.push(p);
  };

  const candidate = new RegExp(CANDIDATE_SRC, "g");
  for (const m of text.matchAll(candidate)) for (const p of phonesFromCandidate(m[0])) add(p);

  // Số đứng ngay sau chữ "zalo" / "zl"
  let zalo: string | null = null;
  const sticky = new RegExp(CANDIDATE_SRC, "y");
  for (const m of text.matchAll(ZALO_WORD_RE)) {
    sticky.lastIndex = (m.index ?? 0) + m[0].length;
    const c = sticky.exec(text);
    if (!c) continue;
    const p = phonesFromCandidate(c[0])[0] ?? null;
    if (p) {
      zalo ??= p;
      add(p);
    }
  }
  // Link zalo.me/0912345678
  for (const m of text.matchAll(ZALO_LINK_RE)) {
    const p = toLocal(m[1].replace(/^\+/, ""));
    if (p) {
      zalo ??= p;
      add(p);
    }
  }

  const emails: string[] = [];
  for (const m of text.matchAll(EMAIL_RE)) {
    const e = m[0].toLowerCase().replace(/[.]+$/, "");
    if (!emails.includes(e)) emails.push(e);
  }

  return { phones, zalo, emails, spelledOut: phones.length === 0 && hasSpelledOutNumber(text) };
}

export function hasContact(c: Contacts): boolean {
  return c.phones.length > 0 || c.emails.length > 0 || c.zalo !== null;
}
