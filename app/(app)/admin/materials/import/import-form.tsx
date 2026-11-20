"use client";

import Link from "next/link";
import { useActionState } from "react";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importMaterialsCsvAction, type ImportState } from "../actions";

const KIND_LABEL = { create: "Thêm mới", update: "Cập nhật", skip: "Bỏ qua" } as const;

// địa chỉ API tải file (khai báo bằng biến vì đây là tải về, không phải chuyển trang)
const EXPORT_HREF = `/api/admin/materials/export`;

export function ImportForm() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importMaterialsCsvAction, {});
  const report = state.report;

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4 sm:max-w-xl">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="file">File CSV</Label>
          <Input id="file" name="file" type="file" accept=".csv,text/csv" required className="h-10 pt-1.5" />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Cách nhập</legend>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="mode" value="upsert" defaultChecked className="mt-1 size-4" />
            <span>
              <b>Cập nhật theo id hoặc mã</b>, chất liệu chưa có thì thêm mới. Ô trống giữ nguyên, ô ghi <code>[xoa]</code> thì xóa giá
              trị.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="mode" value="create-only" className="mt-1 size-4" />
            <span>
              <b>Chỉ thêm mới</b>, bỏ qua mã đã có (không ghi đè).
            </span>
          </label>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dryRun" className="size-4" defaultChecked />
          Chỉ kiểm tra, chưa ghi (bỏ dấu tích để nhập thật)
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" className="h-10 px-5" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            {pending ? "Đang xử lý..." : "Chạy"}
          </Button>
          <a href={EXPORT_HREF} className={buttonVariants({ variant: "outline", className: "h-10" })}>
            <DownloadIcon /> Tải CSV toàn bộ chất liệu
          </a>
        </div>
      </form>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {report && (
        <Alert>
          <AlertTitle>
            {report.dryRun ? "Kiểm tra xong, CHƯA ghi gì" : "Đã nhập xong"}: thêm mới {report.summary.created}, cập nhật {report.summary.updated}, không đổi{" "}
            {report.summary.unchanged}, bỏ qua {report.summary.skipped}, lỗi {report.summary.errors}, đổi thông số tấm {report.stockChanged}
          </AlertTitle>
          <AlertDescription>
            {report.dryRun && report.summary.errors === 0 && <p>Không có lỗi. Bỏ dấu tích &quot;Chỉ kiểm tra&quot; rồi chạy lại để nhập thật.</p>}
            {report.dryRun && report.summary.errors > 0 && <p>Còn dòng lỗi (xem bên dưới). Dòng lỗi sẽ bị bỏ qua, các dòng tốt vẫn được nhập.</p>}
            {report.stockChanged > 0 && (
              <p className="mt-1">
                {report.stockChanged} chất liệu {report.dryRun ? "sẽ đổi" : "đã đổi"} thông số tấm
                {report.dryRun ? "" : " (đã ghi ở Quản trị > Thiết lập báo giá > Lịch sử thay đổi)"}.
              </p>
            )}
            <p className="mt-1 text-xs">Cột đọc được: {report.columns.join(", ")}</p>
            {!report.dryRun && (
              <Link href="/admin/materials" className={buttonVariants({ variant: "outline", size: "sm", className: "mt-2" })}>
                Xem danh sách chất liệu
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}

      {report && report.preview.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Dòng</th>
                <th className="px-3 py-2">Mã</th>
                <th className="px-3 py-2">Việc</th>
                <th className="px-3 py-2">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {report.preview.map((p) => (
                <tr key={`${p.line}-${p.code}`} className="border-t">
                  <td className="px-3 py-1.5 tabular-nums">{p.line}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{p.code}</td>
                  <td className="px-3 py-1.5">{KIND_LABEL[p.kind]}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{p.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.summary.created + report.summary.updated + report.summary.skipped > report.preview.length && (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">Chỉ hiện {report.preview.length} dòng đầu.</p>
          )}
        </div>
      )}

      {report && report.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>{report.errors.length} dòng bị bỏ qua vì lỗi</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {report.errors.slice(0, 40).map((e, i) => (
                <li key={i}>
                  Dòng {e.line}: {e.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
