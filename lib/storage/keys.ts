import { randomInt } from "node:crypto";

/**
 * Cách đặt key ảnh (thuần, có test). Tên file là chuỗi ngẫu nhiên: không dùng tên khách hay tên thương hiệu.
 *
 *   materials/{mã chất liệu}/{vai trò}-{ngẫu nhiên}.webp   vai trò: layer1, layer2, reference
 *   mockups/{brandId}/{yyyy-mm}/{ngẫu nhiên}.webp          ảnh AI gốc và ảnh hoàn thiện
 *   mockups/{brandId}/{yyyy-mm}/{ngẫu nhiên}-thumb.webp    ảnh thu nhỏ (suy ra từ khóa ảnh hoàn thiện)
 *   logos/{customerId}/{ngẫu nhiên}.{đuôi}                  logo gốc (giữ nguyên định dạng) và bản đã chuẩn hóa (png)
 *   logos/{customerId}/{ngẫu nhiên}-ai-v2.png              bản logo gửi cho AI (suy ra từ khóa bản chuẩn hóa)
 *   zalo/..., zalo-assets/...                               ảnh khách gửi qua Zalo và tư liệu chăm sóc (giữ cách đặt tên cũ)
 *
 * Vì sao materials có thêm thư mục mã chất liệu và vai trò: mỗi chất liệu có nhiều ảnh (lớp 1, lớp 2, ảnh ghép gửi AI),
 * và chuỗi ngẫu nhiên ở cuối đổi mỗi lần thay ảnh để trình duyệt/CDN không dùng lại bản cũ đã lưu đệm.
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Chuỗi ngẫu nhiên an toàn mật mã gồm chữ thường và số (mặc định 16 ký tự, khoảng 82 bit). */
export function randomId(length = 16): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Mã chất liệu dùng trong key: chữ thường, số, gạch ngang; ký tự khác đổi thành "-". */
export function slugCode(code: string): string {
  const s = code
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "vl";
}

export type MaterialImageRole = "layer1" | "layer2" | "reference";

export function materialKey(code: string, role: MaterialImageRole): string {
  return `materials/${slugCode(code)}/${role}-${randomId(10)}.webp`;
}

const yyyymm = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function mockupKey(brandId: string, at: Date = new Date()): string {
  return `mockups/${brandId}/${yyyymm(at)}/${randomId(16)}.webp`;
}

/** Key ảnh thu nhỏ của một ảnh hoàn thiện. Khóa ảnh hoàn thiện đổi khi vẽ lại nên ảnh thu nhỏ luôn khớp. */
export function thumbKey(finalKey: string): string {
  return finalKey.replace(/\.(webp|jpg)$/i, (_m, ext: string) => `-thumb.${ext.toLowerCase()}`);
}

/** Đuôi file an toàn từ định dạng ảnh. */
const EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);
export const safeExt = (ext: string) => {
  const e = ext.toLowerCase().replace(/^\./, "");
  return EXTS.has(e) ? (e === "jpeg" ? "jpg" : e) : "bin";
};

/** Bản tải về của một pin Pinterest (ảnh phong cách tham khảo), tải một lần rồi dùng lại, xem lib/jobs/pinterest-reference.ts. */
export function pinterestKey(pinterestPinId: string): string {
  return `pinterest/${pinterestPinId}.jpg`;
}

export function logoKey(customerId: string, ext: string): string {
  return `logos/${customerId}/${randomId(16)}.${safeExt(ext)}`;
}

/** Key bản logo đã chuẩn bị cho AI (nền tương phản), suy ra từ key bản chuẩn hóa. Đổi số khi đổi cách chuẩn bị. */
export const LOGO_AI_VERSION = "v2";
export function logoAiKey(normalizedKey: string): string {
  return normalizedKey.replace(/\.[a-z0-9]+$/i, "") + `-ai-${LOGO_AI_VERSION}.png`;
}

/**
 * Key bản ảnh tham chiếu chất liệu đã gắn dải nhãn "CELL n / FRONT / BACK" để gửi AI (D123), suy ra từ key ảnh tham chiếu
 * gốc nên không cần cột CSDL riêng và vẫn nằm dưới "materials/" (công khai). Mỗi chất liệu có tối đa một bản cho mỗi số ô
 * và mỗi kiểu hàng, tạo khi cần rồi dùng lại. `version` đổi thì tạo bản mới.
 */
export function refTagKey(referenceKey: string, cell: number, kind: "ENGRAVE" | "CUT", version: string): string {
  return referenceKey.replace(/\.[a-z0-9]+$/i, "") + `-tag-${version}-c${cell}-${kind === "CUT" ? "cut" : "eng"}.jpg`;
}

/** Mọi bản gắn nhãn có thể có của một ảnh tham chiếu (10 ô x 2 kiểu hàng), để xóa theo khi ảnh tham chiếu bị xóa hoặc thay. */
export function refTagKeys(referenceKey: string, version: string): string[] {
  const keys: string[] = [];
  for (let cell = 1; cell <= 10; cell++) for (const kind of ["ENGRAVE", "CUT"] as const) keys.push(refTagKey(referenceKey, cell, kind, version));
  return keys;
}

/** Key được phép công khai (đưa thẳng địa chỉ R2 cho trình duyệt và kie.ai). Còn lại đi qua /api/files có kiểm tra đăng nhập. */
const PUBLIC_PREFIXES = ["materials/", "mockups/", "logos/"];
export const isPublicKey = (key: string): boolean => PUBLIC_PREFIXES.some((p) => key.startsWith(p));

/** Loại nội dung theo đuôi file. */
export function contentTypeOf(key: string): string {
  const ext = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  const map: Record<string, string> = {
    webp: "image/webp",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
  };
  return map[ext] ?? "application/octet-stream";
}
