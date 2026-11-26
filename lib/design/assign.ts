/**
 * Chọn kiểu thiết kế cho từng ảnh ở bước 2. Kết quả result[m][v] là chỉ số kiểu của phương án v của chất liệu m.
 * Các phương án của CÙNG một chất liệu dùng kiểu khác nhau (nếu có đủ kiểu), các chất liệu được xoay vòng đều qua các kiểu.
 */
export function assignStyles(materialCount: number, variants: number, styleCount: number): number[][] {
  if (styleCount < 1) throw new Error("Cần ít nhất một kiểu thiết kế.");
  return Array.from({ length: materialCount }, (_, m) =>
    Array.from({ length: variants }, (_, v) => (m * variants + v) % styleCount),
  );
}

export const MIN_VARIANTS = 1;
export const MAX_VARIANTS = 4;
export const DEFAULT_VARIANTS = 2;
export const MAX_DESIGN_MATERIALS = 10;
export const MAX_DESIGN_IMAGES = 24; // chặn tạo quá nhiều ảnh một lần (mỗi ảnh tốn token)

/** Kiểm tra thông số bước 2. Trả về lỗi tiếng Việt hoặc null. */
export function validateDesignRequest(input: { materialCount: number; variants: number; productType: string }): string | null {
  if (input.materialCount < 1) return "Vui lòng chọn ít nhất một chất liệu.";
  if (input.materialCount > MAX_DESIGN_MATERIALS) return `Một lần thiết kế tối đa ${MAX_DESIGN_MATERIALS} chất liệu.`;
  if (!Number.isInteger(input.variants) || input.variants < MIN_VARIANTS || input.variants > MAX_VARIANTS) {
    return `Số phương án mỗi chất liệu phải từ ${MIN_VARIANTS} đến ${MAX_VARIANTS}.`;
  }
  if (!input.productType.trim()) return "Vui lòng nhập loại sản phẩm.";
  const total = input.materialCount * input.variants;
  if (total > MAX_DESIGN_IMAGES) {
    return `Sẽ tạo ${total} ảnh, vượt giới hạn ${MAX_DESIGN_IMAGES} ảnh mỗi lần. Hãy chọn ít chất liệu hoặc ít phương án hơn.`;
  }
  return null;
}

/** Thiết kế theo mẫu Pinterest (D125): mặc định AI chọn 3 chất liệu, mỗi chất liệu 1 phương án (3 ảnh) để xem nhanh, ít tốn lượt. */
export const PIN_DESIGN_DEFAULT_MATERIALS = 3;
export const PIN_DESIGN_DEFAULT_VARIANTS = 1;
/** Số ảnh mẫu Pinterest tối đa cho một lượt; trùng MAX_STYLE_REF_PINS (lib/image-options.ts), có kiểm thử giữ hai số khớp nhau. */
export const PIN_DESIGN_MAX_PINS = 3;

/** Kiểm tra thông số "thiết kế theo mẫu Pinterest". Trả về lỗi tiếng Việt hoặc null. */
export function validatePinDesignRequest(input: { pinCount: number; materialCount: number; variants: number; productType: string }): string | null {
  if (input.pinCount < 1) return "Vui lòng chọn ít nhất một mẫu Pinterest.";
  if (input.pinCount > PIN_DESIGN_MAX_PINS) return `Chỉ chọn tối đa ${PIN_DESIGN_MAX_PINS} mẫu Pinterest cho một lượt.`;
  if (!Number.isInteger(input.materialCount)) return "Số chất liệu không hợp lệ.";
  return validateDesignRequest({ materialCount: input.materialCount, variants: input.variants, productType: input.productType });
}
