/**
 * Tả bằng CHỮ màu và bề mặt hai mặt của một chất liệu để ghi vào prompt tạo ảnh (docs/DECISIONS.md D123). Phép tính thuần.
 *
 * Trước đây AI chỉ biết "ô k dùng ảnh tham chiếu số k + 1, mặt trước là nửa trái". Chỉ dựa vào thứ tự ảnh và trái/phải thì AI
 * hay tráo chất liệu giữa các ô và khắc nhầm mặt (vẽ mặt sau làm mặt tấm). Ghi thêm màu từng mặt bằng chữ cho AI một điểm đối
 * chiếu độc lập: ảnh tham chiếu và dòng chữ của ô không khớp nhau thì nó biết mình đang nhìn nhầm ảnh.
 *
 * Tên màu do xưởng tự gõ bằng tiếng Việt ("bạc gương", "đen xanh than") được giữ nguyên trong ngoặc kép; họ màu và chất bề
 * mặt là mã cố định trong danh mục nên dịch được sang tiếng Anh cho chắc. Mã lạ (xưởng tự thêm) thì bỏ qua phần tiếng Anh.
 */

const FAMILY_EN: Record<string, string> = {
  trang: "white",
  "kem-be": "cream / beige",
  den: "black",
  xam: "grey",
  bac: "silver",
  "vang-kim": "metallic gold",
  vang: "yellow",
  cam: "orange",
  do: "red",
  hong: "pink",
  tim: "purple",
  "xanh-duong": "blue",
  "xanh-ngoc": "teal",
  "xanh-la": "green",
  nau: "brown",
  "nhieu-mau": "multicolour",
};

/** Chất bề mặt chỉ tả mặt TRƯỚC (mặt nhìn thấy của decal). */
const FINISH_EN: Record<string, string> = {
  mo: "matte",
  bong: "glossy",
  guong: "mirror",
  "anh-kim-xuoc": "brushed metallic",
  "nhu-lap-lanh": "glitter",
  "anh-cau-vong": "iridescent",
  "nhung-long": "velvet",
  "phong-noi": "puffy",
  "gia-da": "leather-grain",
  "vai-det": "woven fabric",
};

export type FaceInfo = {
  frontColorName?: string | null;
  frontColorFamily?: string | null;
  backColorName?: string | null;
  backColorFamily?: string | null;
  surfaceFinish?: string | null;
};

const clean = (s: string | null | undefined) => (s ?? "").replace(/["“”]/g, "").replace(/\s+/g, " ").trim();

/** Một mặt: phần tiếng Anh (chất bề mặt + họ màu) rồi tên xưởng đặt trong ngoặc kép. Không có gì để tả thì chuỗi rỗng. */
function face(name: string | null | undefined, family: string | null | undefined, finish?: string | null): string {
  const en = [finish ? FINISH_EN[finish] : undefined, family ? FAMILY_EN[family] : undefined].filter(Boolean).join(" ");
  const vi = clean(name);
  return [en, vi ? `"${vi}"` : ""].filter(Boolean).join(" ");
}

/** Mô tả mặt trước và mặt sau; mặt nào không có dữ liệu thì là chuỗi rỗng. */
export function faceWords(m: FaceInfo): { front: string; back: string } {
  return {
    front: face(m.frontColorName, m.frontColorFamily, m.surfaceFinish),
    back: face(m.backColorName, m.backColorFamily),
  };
}

/**
 * Câu nối vào dòng của một ô trong prompt catalog, hoặc vào câu dặn kiểu hàng của prompt thiết kế.
 * Hàng khắc nêu cả hai mặt và mặt nào ở đâu; hàng cắt chỉ dùng mặt trước. Thiếu dữ liệu thì trả chuỗi rỗng.
 */
export function faceClause(kind: "ENGRAVE" | "CUT", m: FaceInfo): string {
  const { front, back } = faceWords(m);
  if (kind === "CUT") return front ? `material (FRONT panel only): ${front}` : "";
  const parts = [front && `untouched face = FRONT panel: ${front}`, back && `engraved marks = BACK panel: ${back}`].filter(Boolean);
  return parts.join("; ");
}
