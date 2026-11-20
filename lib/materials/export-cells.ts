import type { MaterialCsvField } from "@/lib/csv/materials";
import type { ExistingMaterial } from "./import-plan";

/**
 * Giá trị một ô của file CSV xuất chất liệu (thuần, tách riêng để test xuất rồi nhập lại không đổi gì).
 * Thông số tấm xuất đúng đơn vị lưu trữ: mm cho kích thước, lề, khoảng cách; đồng cho giá (số thường, chấm thập phân, không dấu ngăn nghìn).
 * Chưa có dữ liệu thì để ô trống.
 */
export function materialCsvCell(m: ExistingMaterial, f: MaterialCsvField): string | number {
  switch (f) {
    case "styleTags":
      return [...m.styleTags].sort().join("|");
    case "confidence":
      return m.classifyConfidence ?? "";
    case "needsReview":
      return m.needsReview ? "TRUE" : "FALSE";
    case "isActive":
      return m.isActive ? "TRUE" : "FALSE";
    case "allowRotate":
      return m.allowRotate ? "TRUE" : "FALSE";
    default:
      return m[f] ?? "";
  }
}
