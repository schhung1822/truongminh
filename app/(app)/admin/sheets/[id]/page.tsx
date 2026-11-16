import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SheetEditor } from "@/components/sheets/sheet-editor";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { loadSheetEditorData } from "@/lib/sheets/editor-data";

export const metadata: Metadata = { title: "Sửa trang mẫu" };

export default async function EditSheetPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const sheet = await db.sheet.findUnique({
    where: { id },
    include: { materials: { orderBy: { position: "asc" } } },
  });
  if (!sheet) notFound();
  const { materials, groups } = await loadSheetEditorData(id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Sửa trang mẫu: {sheet.name}</h1>
      <SheetEditor
        materials={materials}
        groups={groups}
        initial={{
          id: sheet.id,
          name: sheet.name,
          groupName: sheet.groupName,
          cols: sheet.cols,
          rows: sheet.rows,
          aspectRatio: sheet.aspectRatio,
          resolution: sheet.resolution,
          isActive: sheet.isActive,
          isDefault: sheet.isDefault,
          materialIds: sheet.materials.map((m) => m.materialId),
        }}
      />
    </div>
  );
}
