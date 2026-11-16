import type { SheetOption } from "@/app/(app)/sessions/new/sheets-steps";

/** Các trang mẫu MẶC ĐỊNH dùng được (đang bật, có ít nhất một chất liệu đủ điều kiện) cho nút Tạo nhanh. */
export function pickDefaultSheets(sheets: SheetOption[]): SheetOption[] {
  return sheets.filter((s) => s.isDefault && s.usable > 0);
}
