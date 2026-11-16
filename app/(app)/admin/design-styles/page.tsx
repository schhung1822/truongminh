import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { StylesBoard, type StyleItem } from "./styles-board";

export const metadata: Metadata = { title: "Kiểu thiết kế" };

export default async function DesignStylesPage() {
  await requireAdmin();
  const rows = await db.designStyle.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { generatedImages: true } } },
  });
  const styles: StyleItem[] = rows.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    isActive: s.isActive,
    sortOrder: s.sortOrder,
    usedCount: s._count.generatedImages,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Kiểu thiết kế</h1>
        <p className="text-muted-foreground">
          Danh sách kiểu dùng ở <b>Bước 2: thiết kế theo chất liệu khách chọn</b>. Mỗi ảnh thiết kế dùng một kiểu; các phương án của
          cùng một chất liệu sẽ dùng kiểu khác nhau. Có {styles.filter((s) => s.isActive).length} kiểu đang bật.
        </p>
      </div>
      <StylesBoard styles={styles} />
    </div>
  );
}
