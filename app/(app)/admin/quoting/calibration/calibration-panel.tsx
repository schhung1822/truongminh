"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { applyCalibrationAction } from "../actions";
import { CALIBRATION_LABEL, type CalibrationKey } from "../calibration-form";
import { ConfirmDialog } from "../confirm-dialog";
import { groupDigits, NO_DATA } from "../format";

export type CalibrationRowData = { key: CalibrationKey; current: number | null; suggested: number | null };

const show = (n: number | null) => (n === null ? "—" : groupDigits(n, 6));

/** Bảng so sánh "đang dùng" với "đề xuất" của bốn thông số máy. Chỉ đổi khi bấm Áp dụng và xác nhận; chỉ các trường được chọn bị đổi. */
export function CalibrationPanel({
  technique,
  techniqueLabel,
  n,
  minSamples,
  r2,
  warnings,
  rows,
  hasProfile,
}: {
  technique: string;
  techniqueLabel: string;
  n: number;
  minSamples: number;
  r2: number | null;
  warnings: string[];
  rows: CalibrationRowData[];
  hasProfile: boolean;
}) {
  const [picked, setPicked] = useState<CalibrationKey[] | null>(null);
  const [pending, start] = useTransition();

  const enough = n >= minSamples;
  const applicable = rows.filter((r) => r.suggested !== null && r.suggested !== r.current);
  const confirmRows = rows.filter((r) => picked?.includes(r.key));

  function run() {
    if (!picked) return;
    const picks = rows.filter((r) => picked.includes(r.key) && r.suggested !== null).map((r) => ({ key: r.key, value: r.suggested as number }));
    start(async () => {
      const r = await applyCalibrationAction(technique, picks);
      setPicked(null);
      if (r.error) toast.error(r.error);
      else toast.success(r.ok ?? "Đã áp dụng.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-sm">
          Công nghệ: <b>{techniqueLabel}</b>
        </p>
        <p className="text-sm">
          Số đơn đã ghi có đủ số liệu: <b className="tabular-nums">{n}</b> / cần ít nhất {minSamples}
        </p>
        <p className="text-sm">
          Độ khớp R2: <b className="tabular-nums">{r2 === null ? "chưa tính được" : r2.toFixed(3)}</b>
        </p>
      </div>

      {!enough && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Chưa đề xuất được.</p>
          <p className="mt-1">
            {warnings[0] ?? `Mới có ${n} đơn, cần ít nhất ${minSamples} đơn.`} Ghi thêm đơn đã làm ở mục{" "}
            <Link href="/admin/quoting/times" className="underline underline-offset-4">
              Thời gian máy thực tế
            </Link>
            . Chưa có đủ đơn thì không có nút Áp dụng.
          </p>
        </div>
      )}

      {enough && warnings.length > 0 && (
        <ul className="list-disc space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 pl-7 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Thông số</TableHead>
              <TableHead className="text-right">Đang dùng</TableHead>
              <TableHead />
              <TableHead className="text-right">Đề xuất</TableHead>
              <TableHead className="pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const meta = CALIBRATION_LABEL[r.key];
              const same = r.suggested !== null && r.suggested === r.current;
              return (
                <TableRow key={r.key}>
                  <TableCell className="pl-4">
                    {meta.label} <span className="text-xs text-muted-foreground">({meta.unit})</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.current === null ? <span className="text-muted-foreground">{NO_DATA}</span> : groupDigits(r.current, 6)}</TableCell>
                  <TableCell className="px-0 text-muted-foreground">
                    <ArrowRightIcon className="size-3.5" />
                  </TableCell>
                  <TableCell className={cn("text-right font-medium tabular-nums", r.suggested === null && "font-normal text-muted-foreground")}>{show(r.suggested)}</TableCell>
                  <TableCell className="pr-4 text-right">
                    {enough && r.suggested !== null ? (
                      same ? (
                        <span className="text-xs text-muted-foreground">Đang đúng bằng đề xuất</span>
                      ) : (
                        <Button type="button" size="sm" variant="outline" onClick={() => setPicked([r.key])} disabled={pending}>
                          Áp dụng
                        </Button>
                      )
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {enough && applicable.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" className="h-10" onClick={() => setPicked(applicable.map((r) => r.key))} disabled={pending}>
            Áp dụng tất cả ({applicable.length})
          </Button>
        </div>
      )}
      {enough && applicable.length === 0 && rows.some((r) => r.suggested !== null) && <p className="text-sm text-muted-foreground">Các thông số đang dùng đã đúng bằng đề xuất, không cần áp dụng gì.</p>}

      <p className="text-sm font-medium">Chỉ áp dụng khi bạn bấm. Hệ thống không tự đổi thông số nào.</p>
      <p className="text-xs text-muted-foreground">
        Đề xuất được ước lượng từ các đơn đã ghi theo công thức: phút = cài đặt + đổi tấm × số tấm + chiều dài cắt ÷ (tốc độ cắt × 60) + diện tích khắc ÷ (tốc độ khắc × 60). Số đề xuất làm tròn 4 chữ số có nghĩa; số hiện ở đây là số sẽ được lưu.
        {!hasProfile && " Công nghệ này chưa có dòng thông số máy: áp dụng sẽ tạo dòng mới chỉ với các thông số được chọn, các ô còn lại vẫn trống và cần nhập ở mục Thông số máy."}
      </p>

      <ConfirmDialog
        open={picked !== null}
        onOpenChange={(o) => !o && setPicked(null)}
        title="Áp dụng đề xuất hiệu chỉnh?"
        description="Chỉ các thông số bên dưới bị đổi; mọi thông số khác của máy giữ nguyên. Thay đổi được ghi vào Lịch sử thay đổi."
        confirmLabel="Áp dụng"
        cancelLabel="Quay lại"
        pending={pending}
        onConfirm={run}
      >
        <ul className="space-y-1 text-sm">
          {confirmRows.map((r) => (
            <li key={r.key}>
              <b>{CALIBRATION_LABEL[r.key].label}</b>: {r.current === null ? NO_DATA : groupDigits(r.current, 6)} → <b>{show(r.suggested)}</b> {CALIBRATION_LABEL[r.key].unit}
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </div>
  );
}
