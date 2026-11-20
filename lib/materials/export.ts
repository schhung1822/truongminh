import "server-only";
import { MATERIAL_CSV_COLUMNS } from "@/lib/csv/materials";
import { csvLine } from "@/lib/stats/csv";
import { materialCsvCell } from "./export-cells";
import { loadExistingForImport } from "./import";

/** CSV toàn bộ chất liệu, cùng định dạng với file nhập (sửa bằng Excel rồi nhập lại ở chế độ cập nhật). Dùng đúng bộ đọc của lần nhập nên xuất rồi nhập lại không đổi gì. */
export async function buildMaterialsCsv(): Promise<string> {
  const rows = await loadExistingForImport();
  const lines = [csvLine([...MATERIAL_CSV_COLUMNS])];
  for (const m of rows) lines.push(csvLine(MATERIAL_CSV_COLUMNS.map((f) => materialCsvCell(m, f))));
  // BOM để Excel mở đúng tiếng Việt có dấu
  return "﻿" + lines.join("\r\n") + "\r\n";
}
