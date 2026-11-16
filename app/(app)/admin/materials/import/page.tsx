import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/dal";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Nhập chất liệu từ CSV" };

export default async function ImportPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Nhập chất liệu từ CSV</h1>
        <p className="text-muted-foreground">
          Nhập danh sách trước, bổ sung ảnh và mô tả AI sau trong trang{" "}
          <Link href="/admin/materials" className="underline">
            Chất liệu
          </Link>
          .
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Định dạng file</CardTitle>
          <CardDescription>
            Dòng đầu là tiêu đề cột. Bắt buộc có cột <b>mã</b> và <b>tên</b>. Các cột khác (không bắt buộc):{" "}
            <b>nhóm</b>, <b>công nghệ in</b>, <b>mô tả</b>. Lưu từ Excel dạng CSV UTF-8. Mã đã có trong hệ thống sẽ được
            bỏ qua, không bị ghi đè.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
            {`mã,tên,nhóm,công nghệ in,mô tả
V01,Vải bố trắng,Vải,In UV,Vải dày dặn
N05,Mica trong,Nhựa,Khắc laser,Mica trong suốt 3mm`}
          </pre>
        </CardContent>
      </Card>

      <ImportForm />
    </div>
  );
}
