/**
 * Hình thành phẩm theo công nghệ gia công của chất liệu (xem docs/DECISIONS.md D90, D101, D113). Phép tính thuần, không phụ thuộc CSDL.
 *
 * Mỗi chất liệu (decal) luôn ra một trong hai kiểu hàng, do "Công nghệ in" (technique) của chất liệu quyết định, không do AI
 * tự chọn và không theo vị trí ô:
 * - ENGRAVE (Khắc laser): hai lớp. Lớp trên (mặt trước, nửa TRÁI ảnh mẫu) được giữ lại, laser khắc bỏ lớp trên ở chỗ cần lộ
 *   lớp dưới (mặt sau, nửa PHẢI).
 * - CUT (Cắt laser): MỘT lớp phẳng của chất liệu mặt trước cắt theo hình logo, không viền lớp 2, không khắc.
 *
 * Hình dạng tấm khắc phụ thuộc logo, và việc này do NGƯỜI DÙNG chốt trên từng logo (Logo.isBadge, D113), không để AI đoán:
 * - logo thường: tấm ôm sát hình logo, mặt trước = lớp 1, viền mảnh quanh mép = lớp 2;
 * - logo dạng huy hiệu/bảng (có nền + khung viền riêng): giữ nguyên hình bảng. MẶT BẢNG (nền) là mặt decal gốc được giữ lại
 *   (lớp 1, phần lớn diện tích); laser chỉ khắc các NÉT của logo vào đó: đường khung, biểu tượng, chữ chìm xuống, lộ lớp 2.
 *   Như mẫu thật "adidas EQUIPMENT": nền vàng là mặt decal gốc, chữ và đường khung đen là nét khắc.
 *   (Trước D122 hệ thống hiểu NGƯỢC lại: khắc bỏ cả mảng nền, giữ chữ. Chủ xưởng xác nhận như vậy là sai thực tế.)
 * Nguyên tắc chung của hàng khắc (D122): phần bị khắc luôn NHỎ hơn phần mặt gốc còn giữ lại. Khắc mảng lớn sẽ cháy, sinh muội đen.
 * Hàng cắt thì luôn chỉ cắt biểu tượng + chữ, kể cả với logo dạng huy hiệu.
 *
 * Không có kiểu riêng cho "In UV" (D101). Nhãn công nghệ tự thêm (ngoài hai mã mặc định) được đoán theo chữ, không rõ thì coi là khắc.
 */

export type FinishKind = "ENGRAVE" | "CUT";

/** Mã (value) của hai công nghệ mặc định trong danh mục "Công nghệ in" (lib/materials/option-types.ts). */
const BY_OPTION_VALUE: Record<string, FinishKind> = {
  "khac-laser": "ENGRAVE",
  "cat-laser": "CUT",
};

/** Bỏ dấu, hạ chữ thường để so khớp nhãn tiếng Việt ("Cắt laser" -> "cat laser"). */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

/**
 * Chất liệu này là hàng khắc hay cắt. Không rõ công nghệ thì coi là khắc, đúng như cách hệ thống vẫn vẽ từ trước tới nay.
 * Nhãn có cả "khắc" lẫn "cắt" thì lấy khắc (hàng khắc được cũng cắt được). Nhãn có "uv"/"in" không còn được coi là một
 * kiểu riêng (D101): rơi về mặc định khắc như mọi nhãn lạ khác.
 */
export function finishKindOf(m: { technique?: string | null; printTech?: string | null }): FinishKind {
  const byValue = m.technique ? BY_OPTION_VALUE[m.technique] : undefined;
  if (byValue) return byValue;
  const label = fold(`${m.printTech ?? ""} ${m.technique ?? ""}`);
  if (/\bkhac\b|engrav/.test(label)) return "ENGRAVE";
  if (/\bcat\b|\bcut\b/.test(label)) return "CUT";
  return "ENGRAVE";
}

/** Tên kiểu hàng ghi trên từng ô của prompt catalog (tiếng Anh vì gửi cho AI). */
export const FINISH_LABEL: Record<FinishKind, string> = { ENGRAVE: "ENGRAVED", CUT: "CUT-ONLY" };

/**
 * Vẻ khắc laser, giữ đúng cách tả của phiên 13:27 ngày 25/11/2026 (bản chủ dự án chốt là ra ảnh khắc đẹp nhất, D114):
 * nét khắc mảnh, sắc, phẳng tuyệt đối; khắc CHÌM vào bề mặt chứ không phải chi tiết nổi dán lên.
 */
const ENGRAVE_LOOK =
  "The surface has the fine, crisp, perfectly flat laser-engraved look of the sample: engraved INTO the surface, with no bevel, no 3D relief, no shiny chrome emboss and no separate emblem glued on top.";

/**
 * Nguyên tắc sản xuất do chủ xưởng nêu (D122): phần bị laser khắc đi luôn là phần NHỎ, không bao giờ lớn hơn phần mặt decal
 * gốc còn giữ lại, vì khắc nhiều thì vật liệu cháy sinh muội đen. Tức là chỉ khắc nét (chữ, biểu tượng, đường khung),
 * không bao giờ khắc bỏ cả một mảng nền.
 */
const ENGRAVE_AREA =
  "Engraving is used sparingly: the engraved area (the part showing the BACK material) is always clearly SMALLER than the untouched FRONT surface, never the other way round, because engraving a large area scorches the material. Never engrave away a whole background or any large fill.";

const ENGRAVE_SILHOUETTE = `two-layer laser-engraved piece, die-cut to the logo's own silhouette (symbol and letters, same spacing). The flat front face is the FRONT material (LEFT panel). A thin, even border of the BACK material (RIGHT panel), about 2-3% of the logo width, runs around the outline of every part, like a flat offset sticker border, never a thick wall. ${ENGRAVE_AREA} ${ENGRAVE_LOOK} The two materials must be clearly distinguishable, like the two panels.`;

const ENGRAVE_BADGE = `two-layer laser-engraved plate that keeps the logo's badge shape: ONE solid plate with the badge's outer shape (same proportions and corner rounding), never the bare letters alone. The plate's face, i.e. the badge's background, is the untouched FRONT material (LEFT panel): it stays at the plate's original flat top level and is the dominant area of the plate. The laser engraves only the logo's artwork into that face: the badge's border line, symbol, wordmark and tagline are engraved a hair below the surface and show the BACK material (RIGHT panel), like the fine marks burnt into a real engraved tag, never the background around them. ${ENGRAVE_AREA} If the artwork is so bold that engraving all of it would cover more than half of the plate, engrave only the outlines of its shapes. ${ENGRAVE_LOOK} The two materials must be clearly distinguishable, like the two panels.`;

const CUT_SILHOUETTE =
  "single-layer cut decal: ONE thin flat layer of the FRONT material (LEFT panel only), cut out along the logo's own silhouette (symbol and letters, same spacing), like a die-cut sticker, in one continuous flat colour and pattern. No border or rim of a second material, no engraving, no recessed areas. The RIGHT (back) panel is not used.";

const CUT_BADGE = `${CUT_SILHOUETTE} Only the symbol, wordmark and tagline are cut out: the badge's background plate and border line are dropped.`;

/**
 * Câu mô tả một kiểu hàng cho AI (tiếng Anh). `badge` = logo dạng huy hiệu/bảng do người dùng đánh dấu trên logo (D113).
 * Dùng một lần cho mỗi kiểu ở đầu danh sách ô của catalog, và cho biến {{material_finish}} của prompt thiết kế.
 */
export function finishRule(kind: FinishKind, badge = false): string {
  if (kind === "CUT") return badge ? CUT_BADGE : CUT_SILHOUETTE;
  return badge ? ENGRAVE_BADGE : ENGRAVE_SILHOUETTE;
}

export function finishRuleOf(m: { technique?: string | null; printTech?: string | null }, badge = false): string {
  return finishRule(finishKindOf(m), badge);
}
