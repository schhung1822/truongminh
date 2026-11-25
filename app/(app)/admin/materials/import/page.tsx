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
          Nhập danh sách trước, bổ sung ảnh mặt trước, mặt sau sau trong trang{" "}
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
            Cách dễ nhất để chỉnh hàng loạt: bấm <b>Tải CSV toàn bộ chất liệu</b> bên dưới, sửa bằng Excel rồi nhập lại ở chế độ cập nhật.
            Dòng đầu là tiêu đề cột; cần có cột <b>id</b> hoặc <b>code</b> (mã). Cột <b>id</b> khớp trước, nên đổi được mã. Lưu từ Excel dạng CSV UTF-8.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <ul className="list-disc pl-5">
            <li>
              Các cột: <code>id, code, name, thicknessMm, baseMaterial, technique, surfaceFinish, surfacePattern, colorCount (ONE/TWO), frontColorName, frontColorFamily,
              frontColorConfidence, backColorName, backColorFamily, backColorConfidence, seriesCode, styleTags (a|b|c), aiVisualNote, descHuman, photoIssue (a|b),
              confidence, needsReview (TRUE/FALSE), reviewNote, isActive, sortOrder</code>. Cột nào không có thì không bị đụng tới.
            </li>
            <li>
              Thông số tấm để báo giá, <b>dùng đúng đơn vị lưu trữ</b> (khác form sửa chất liệu, nơi kích thước tấm tính bằng cm):{" "}
              <code>stockWidthMm</code> (rộng tấm, mm), <code>stockHeightMm</code> (cao tấm, mm), <code>stockPrice</code> (giá một tấm, đồng, số liền không dấu ngăn nghìn),{" "}
              <code>edgeMarginMm</code> (lề tấm, mm), <code>gapMm</code> (khoảng cách giữa logo, mm), <code>allowRotate</code> (TRUE/FALSE). Rộng, cao, giá phải lớn hơn 0; lề và khoảng cách từ 0
              trở lên. Ô trống = giữ nguyên, <code>[xoa]</code> = xóa (chưa có dữ liệu). Thay đổi được ghi ở Quản trị &gt; Thiết lập báo giá &gt; Lịch sử thay đổi.
            </li>
            <li>
              Các cột phân loại chỉ nhận <b>giá trị có trong danh mục</b> (ghi mã không dấu như <code>khac-laser</code> hoặc đúng nhãn như &quot;Khắc laser&quot;). Xem và
              sửa danh mục ở{" "}
              <Link href="/admin/materials/options" className="underline">
                Danh mục chất liệu
              </Link>
              .
            </li>
            <li>
              <b>Ô trống = giữ nguyên.</b> Muốn xóa một giá trị thì ghi <code>[xoa]</code> vào ô.
            </li>
            <li>
              File cũ chỉ có mã, tên, nhóm, công nghệ in, độ dày, mô tả vẫn nhập được (nhóm và công nghệ in phải trùng nhãn trong danh mục). Chất liệu mới mà chưa chọn
              được nhóm hoặc công nghệ in sẽ được đánh dấu &quot;cần xem lại&quot;.
            </li>
          </ul>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
            {`code,name,thicknessMm,baseMaterial,technique,surfaceFinish,colorCount
V01,Vải bố trắng,0.5,vai,cat-laser,mo,ONE
N05,Mica trong,1.2,nhua,khac-laser,bong,TWO`}
          </pre>
        </CardContent>
      </Card>

      <ImportForm />
    </div>
  );
}
