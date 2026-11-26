import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, StarIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { countSheetImages, materialsPerImage } from "@/lib/sheets/split";
import { SheetActiveToggle } from "./sheet-active-toggle";
import { SheetDefaultToggle } from "./sheet-default-toggle";

export const metadata: Metadata = { title: "Trang mẫu" };

export default async function SheetsPage() {
  await requireAdmin();
  const [sheets, orphans] = await Promise.all([
    db.sheet.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { materials: true } } },
    }),
    // Chất liệu đang bật nhưng chưa nằm trong trang mẫu nào
    db.material.findMany({
      where: { isActive: true, sheetMaterials: { none: {} } },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Trang mẫu</h1>
          <p className="text-muted-foreground">
            Số cột x hàng là bố cục của một ảnh. Trang có nhiều chất liệu hơn số ô sẽ tự chia thành nhiều ảnh (ví dụ 80 chất liệu, mỗi ảnh 8 ô: 10 ảnh). Trang đánh dấu <b>Mặc định</b> sẽ được tick sẵn khi sale bấm &quot;Chọn bộ chất liệu&quot;
            (sale chỉ cần bấm tiếp, không phải tự chọn). Có thể đặt nhiều trang mặc định.
          </p>
        </div>
        <Link href="/admin/sheets/new" className={buttonVariants({ className: "h-10" })}>
          <PlusIcon /> Thêm trang mẫu
        </Link>
      </div>

      {orphans.length > 0 && (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>{orphans.length} chất liệu đang bật nhưng chưa nằm trong trang mẫu nào</AlertTitle>
          <AlertDescription>
            Sale sẽ không thấy các chất liệu này trong ảnh catalog:{" "}
            {orphans
              .slice(0, 15)
              .map((m) => m.code)
              .join(", ")}
            {orphans.length > 15 && ` và ${orphans.length - 15} chất liệu khác`}.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="overflow-x-auto">
          {sheets.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Chưa có trang mẫu nào.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên</TableHead>
                  <TableHead>Nhóm</TableHead>
                  <TableHead>Bố cục</TableHead>
                  <TableHead>Chất liệu</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheets.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.name}
                      {s.isDefault && (
                        <Badge className="ml-2 bg-amber-100 text-amber-800 hover:bg-amber-100">
                          <StarIcon className="size-3 fill-amber-400 text-amber-500" /> Mặc định
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{s.groupName || "-"}</TableCell>
                    <TableCell>
                      {s.cols} x {s.rows}, {s.aspectRatio}, {s.resolution}
                    </TableCell>
                    <TableCell>
                      {s._count.materials}
                      {s._count.materials > materialsPerImage(s.cols, s.rows) && (
                        <span className="text-muted-foreground"> ({countSheetImages(s._count.materials, s.cols, s.rows)} ảnh)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.isActive ? <Badge>Đang bật</Badge> : <Badge variant="secondary">Đã tắt</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link href={`/admin/sheets/${s.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                          Sửa
                        </Link>
                        <SheetDefaultToggle id={s.id} isDefault={s.isDefault} disabled={!s.isActive} />
                        <SheetActiveToggle id={s.id} isActive={s.isActive} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
