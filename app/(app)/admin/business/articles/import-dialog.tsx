"use client";

import { useActionState, useState } from "react";
import { Loader2Icon, UploadIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importArticlesCsvAction, type ImportArticlesState } from "../actions";

/** Nhập CSV bài kiến thức: hộp thoại có ô chọn file và báo cáo số bài tạo, cập nhật, lỗi. */
export function ImportDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ImportArticlesState, FormData>(importArticlesCsvAction, {});
  const report = state.report;

  return (
    <>
      <Button type="button" variant="outline" className="h-10" onClick={() => setOpen(true)}>
        <UploadIcon /> Nhập CSV
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nhập bài kiến thức từ CSV</DialogTitle>
            <DialogDescription>
              Cách dễ nhất: bấm Xuất CSV, sửa bằng Excel rồi nhập lại. Tối đa 500 dòng và 2MB, lưu dạng CSV UTF-8.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            <li>
              Cột: <code>id, title, category, visibility, status, roles, tags, priority, alwaysInclude, effectiveFrom, body</code>. Cần ít nhất cột <code>id</code> hoặc <code>title</code>.
            </li>
            <li>
              Dòng có <b>id</b> khớp thì cập nhật (ô trống giữ nguyên, ghi <code>[xoa]</code> để xóa vai, tag, ngày hiệu lực). Dòng <b>không có id</b> thì tạo bài mới ở trạng thái <b>Nháp</b>, mức Nội bộ nếu để trống.
            </li>
            <li>
              Vai và tag cách nhau dấu <code>|</code>. Dòng lỗi được liệt kê và bỏ qua, các dòng tốt vẫn được nhập. Số dòng tính theo bảng tính (dòng 1 là tiêu đề).
            </li>
          </ul>
          <form action={formAction} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="articles-csv-file">File CSV</Label>
              <Input id="articles-csv-file" name="file" type="file" accept=".csv,text/csv" required className="h-10 pt-1.5" />
            </div>
            <div>
              <Button type="submit" className="h-10" disabled={pending}>
                {pending && <Loader2Icon className="animate-spin" />}
                {pending ? "Đang nhập..." : "Nhập"}
              </Button>
            </div>
          </form>

          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {report && (
            <Alert variant={report.errors.length > 0 && report.created + report.updated === 0 ? "destructive" : "default"}>
              <AlertTitle>
                Xong: tạo mới {report.created}, cập nhật {report.updated}, lỗi {report.errors.length} (trên {report.total} dòng dữ liệu)
              </AlertTitle>
              {report.errors.length > 0 && (
                <AlertDescription>
                  <ul className="mt-1 list-disc pl-5">
                    {report.errors.slice(0, 50).map((e, i) => (
                      <li key={i}>
                        Dòng {e.line}: {e.message}
                      </li>
                    ))}
                  </ul>
                  {report.errors.length > 50 && <p className="mt-1 text-xs">Chỉ hiện 50 lỗi đầu.</p>}
                </AlertDescription>
              )}
            </Alert>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
