import "server-only";
import type { EditorMaterial } from "@/components/sheets/sheet-editor";
import { db } from "@/lib/db";
import { fileUrl } from "@/lib/storage";

/** Dữ liệu cho màn hình sửa trang mẫu: mọi chất liệu + các trang khác đã chứa chúng. */
export async function loadSheetEditorData(currentSheetId: string | null) {
  const [materials, groupRows] = await Promise.all([
    db.material.findMany({
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: { sheetMaterials: { include: { sheet: { select: { id: true, name: true } } } } },
    }),
    db.material.findMany({ distinct: ["groupName"], select: { groupName: true }, orderBy: { groupName: "asc" } }),
  ]);

  const editorMaterials: EditorMaterial[] = materials.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    groupName: m.groupName,
    isActive: m.isActive,
    imageUrl: fileUrl(m.referencePath),
    otherSheets: m.sheetMaterials.filter((sm) => sm.sheet.id !== currentSheetId).map((sm) => sm.sheet.name),
  }));
  return { materials: editorMaterials, groups: groupRows.map((g) => g.groupName) };
}
