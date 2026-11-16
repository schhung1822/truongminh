import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, UploadIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { fileUrl } from "@/lib/storage";
import { ActiveToggle } from "./active-toggle";

export const metadata: Metadata = { title: "Chất liệu" };

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; group?: string; status?: string }>;
}) {
  await requireAdmin();
  const { q = "", group = "", status = "" } = await searchParams;

  const [materials, groupRows, total] = await Promise.all([
    db.material.findMany({
      where: {
        ...(q
          ? { OR: [{ code: { contains: q } }, { name: { contains: q } }, { printTech: { contains: q } }] }
          : {}),
        ...(group ? { groupName: group } : {}),
        ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      take: 300,
    }),
    db.material.findMany({ distinct: ["groupName"], select: { groupName: true }, orderBy: { groupName: "asc" } }),
    db.material.count(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Chất liệu</h1>
          <p className="text-muted-foreground">Thư viện {total} chất liệu của xưởng.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/materials/import" className={buttonVariants({ variant: "outline", className: "h-10" })}>
            <UploadIcon /> Nhập từ CSV
          </Link>
          <Link href="/admin/materials/new" className={buttonVariants({ className: "h-10" })}>
            <PlusIcon /> Thêm chất liệu
          </Link>
        </div>
      </div>

      <form method="get" className="grid gap-2 sm:grid-cols-[1fr_200px_160px_auto]">
        <Input name="q" defaultValue={q} placeholder="Tìm theo mã, tên, công nghệ in" className="h-10" />
        <NativeSelect name="group" defaultValue={group} aria-label="Lọc theo nhóm">
          <option value="">Mọi nhóm</option>
          {groupRows.map((g) => (
            <option key={g.groupName} value={g.groupName}>
              {g.groupName}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={status} aria-label="Lọc theo trạng thái">
          <option value="">Mọi trạng thái</option>
          <option value="active">Đang bật</option>
          <option value="inactive">Đã tắt</option>
        </NativeSelect>
        <Button type="submit" variant="secondary" className="h-10 px-5">
          Lọc
        </Button>
      </form>

      <Card>
        <CardContent className="overflow-x-auto">
          {materials.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {total === 0 ? "Chưa có chất liệu nào. Bấm \"Thêm chất liệu\" hoặc nhập từ CSV." : "Không có chất liệu khớp bộ lọc."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Ảnh</TableHead>
                  <TableHead>Mã</TableHead>
                  <TableHead>Tên</TableHead>
                  <TableHead>Nhóm</TableHead>
                  <TableHead>Công nghệ in</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((m) => {
                  const ref = fileUrl(m.referencePath);
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        {ref ? (
                          <img src={ref} alt={m.name} className="h-12 w-20 rounded border object-contain" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Thiếu ảnh</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{m.code}</TableCell>
                      <TableCell>
                        {m.name}
                        {!m.descAi && (
                          <Badge variant="secondary" className="ml-2">
                            Thiếu mô tả AI
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{m.groupName}</TableCell>
                      <TableCell>{m.printTech}</TableCell>
                      <TableCell>
                        {m.isActive ? <Badge>Đang bật</Badge> : <Badge variant="secondary">Đã tắt</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link
                            href={`/admin/materials/${m.id}`}
                            className={buttonVariants({ variant: "outline", size: "sm" })}
                          >
                            Sửa
                          </Link>
                          <ActiveToggle id={m.id} isActive={m.isActive} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {materials.length === 300 && (
            <p className="pt-3 text-xs text-muted-foreground">Chỉ hiện 300 dòng đầu. Hãy dùng ô tìm kiếm để thu hẹp.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
