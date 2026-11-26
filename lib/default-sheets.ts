import type { SheetOption } from "@/app/(app)/sessions/new/sheets-steps";

/** Các trang mẫu MẶC ĐỊNH dùng được (đang bật, có ít nhất một chất liệu đủ điều kiện). */
export function pickDefaultSheets(sheets: SheetOption[]): SheetOption[] {
  return sheets.filter((s) => s.isDefault && s.usable > 0);
}

/**
 * Trang mẫu được tick sẵn ở bước "Chọn bộ chất liệu" (D126): các trang MẶC ĐỊNH; chưa đặt trang mặc định nào thì tick mọi
 * trang dùng được như trước. Nhờ vậy bấm "Chọn bộ chất liệu" rồi Tiếp là ra đúng bộ mà nút "Tạo nhanh" cũ từng tạo.
 */
export function preselectedSheets(sheets: SheetOption[]): Set<string> {
  const defaults = pickDefaultSheets(sheets);
  return new Set((defaults.length > 0 ? defaults : sheets.filter((s) => s.usable > 0)).map((s) => s.id));
}
