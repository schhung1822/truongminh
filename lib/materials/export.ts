import "server-only";
import { MATERIAL_CSV_COLUMNS, type MaterialCsvField } from "@/lib/csv/materials";
import { db } from "@/lib/db";
import { csvLine } from "@/lib/stats/csv";

/** CSV toàn bộ chất liệu, cùng định dạng với file nhập (sửa bằng Excel rồi nhập lại ở chế độ cập nhật). */
export async function buildMaterialsCsv(): Promise<string> {
  const rows = await db.material.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: { styleTags: { select: { value: true } } },
  });
  const cell = (m: (typeof rows)[number], f: MaterialCsvField): string | number => {
    switch (f) {
      case "styleTags":
        return m.styleTags.map((t) => t.value).sort().join("|");
      case "confidence":
        return m.classifyConfidence ?? "";
      case "needsReview":
        return m.needsReview ? "TRUE" : "FALSE";
      case "isActive":
        return m.isActive ? "TRUE" : "FALSE";
      case "thicknessMm":
        return m.thicknessMm ?? "";
      case "colorCount":
        return m.colorCount ?? "";
      default:
        return (m[f as keyof typeof m] as string | number | null) ?? "";
    }
  };
  const lines = [csvLine([...MATERIAL_CSV_COLUMNS])];
  for (const m of rows) lines.push(csvLine(MATERIAL_CSV_COLUMNS.map((f) => cell(m, f))));
  // BOM để Excel mở đúng tiếng Việt có dấu
  return "﻿" + lines.join("\r\n") + "\r\n";
}
