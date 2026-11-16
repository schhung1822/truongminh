import type { Metadata } from "next";
import { SheetEditor } from "@/components/sheets/sheet-editor";
import { requireAdmin } from "@/lib/auth/dal";
import { getSettings } from "@/lib/settings";
import { loadSheetEditorData } from "@/lib/sheets/editor-data";

export const metadata: Metadata = { title: "Thêm trang mẫu" };

export default async function NewSheetPage() {
  await requireAdmin();
  const [{ materials, groups }, settings] = await Promise.all([loadSheetEditorData(null), getSettings()]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Thêm trang mẫu</h1>
      <SheetEditor
        materials={materials}
        groups={groups}
        initial={{
          id: null,
          name: "",
          groupName: "",
          cols: 2,
          rows: 5,
          aspectRatio: "2:3",
          resolution: settings.defaultResolution,
          isActive: true,
          isDefault: false,
          materialIds: [],
        }}
      />
    </div>
  );
}
