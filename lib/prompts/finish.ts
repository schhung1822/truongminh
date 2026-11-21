/**
 * Hình thành phẩm theo công nghệ gia công của chất liệu (xem docs/DECISIONS.md D90). Phép tính thuần, không phụ thuộc CSDL.
 *
 * Xưởng có ba kiểu hàng, trông khác nhau nên AI phải biết ô/ảnh đang vẽ kiểu nào:
 * - ENGRAVE (Khắc laser): kiểu hai lớp hiện nay, mặt trước = lớp 1, viền mảnh = lớp 2, bề mặt có vẻ khắc laser.
 * - CUT (Cắt laser): decal mỏng chỉ cắt theo hình logo. MỘT lớp phẳng của chất liệu mặt trước, không viền lớp 2, không khắc.
 * - PRINT (In UV): màu và họa tiết in phẳng trên mặt nhẵn, không khắc, không chiều sâu.
 *
 * Căn cứ là cột "Công nghệ in" (technique) của chất liệu. Nhãn tự thêm sau này (không nằm trong ba mã mặc định) được đoán theo chữ.
 */

export type FinishKind = "ENGRAVE" | "CUT" | "PRINT";

/** Mã (value) của ba công nghệ mặc định trong danh mục "Công nghệ in" (lib/materials/option-types.ts). */
const BY_OPTION_VALUE: Record<string, FinishKind> = {
  "khac-laser": "ENGRAVE",
  "cat-laser": "CUT",
  "in-uv": "PRINT",
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
 * Chất liệu này là hàng khắc, cắt hay in. Không rõ công nghệ thì coi là khắc, đúng như cách hệ thống vẫn vẽ từ trước tới nay.
 * Nhãn có cả "khắc" lẫn "cắt" thì lấy khắc (hàng khắc được cũng cắt được).
 */
export function finishKindOf(m: { technique?: string | null; printTech?: string | null }): FinishKind {
  const byValue = m.technique ? BY_OPTION_VALUE[m.technique] : undefined;
  if (byValue) return byValue;
  const label = fold(`${m.printTech ?? ""} ${m.technique ?? ""}`);
  if (/\bkhac\b|engrav/.test(label)) return "ENGRAVE";
  if (/\bcat\b|\bcut\b/.test(label)) return "CUT";
  if (/\buv\b|\bprint/.test(label)) return "PRINT";
  return "ENGRAVE";
}

/** Câu dặn AI cho từng kiểu hàng (tiếng Anh vì gửi cho AI). Dùng cho từng ô của catalog và cho biến {{material_finish}} của prompt thiết kế. */
export const FINISH_RULES: Record<FinishKind, string> = {
  ENGRAVE:
    "laser-engraved look. The surface has the fine, crisp, perfectly flat laser-engraved look of the sample (engraved into the surface, never raised). The front face and the thin back-material border are shown exactly as in the two panels.",
  PRINT:
    "flat UV print. The colour and pattern are printed flat on a smooth surface: no engraving, no etched or recessed areas, no relief, no depth. The front face and the thin back-material border are shown exactly as in the two panels.",
  CUT: "CUT-ONLY decal. The piece is ONE single thin flat layer cut out along the logo outline, made only of the FRONT material (LEFT panel), like a die-cut sticker. There is NO border or rim of a second material, NO visible edge wall or thickness, NO engraving, NO etched or recessed areas and NO depth: the letters and symbol are only the cut silhouette in one continuous flat colour and pattern. Do not use the RIGHT (back) panel at all. This overrides any general rule that the border is made of the back material.",
};

export function finishRuleOf(m: { technique?: string | null; printTech?: string | null }): string {
  return FINISH_RULES[finishKindOf(m)];
}
