"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDong, type StockFormValues } from "@/lib/materials/stock";
import { saveMaterialStockAction } from "../stock-actions";

const HISTORY_NOTE =
  "Để trống nghĩa là chưa có dữ liệu, công cụ báo giá sẽ không ra giá cho chất liệu này. Mọi thay đổi được ghi ở Quản trị > Thiết lập báo giá > Lịch sử thay đổi.";

const same = (a: StockFormValues, b: StockFormValues) =>
  a.widthCm === b.widthCm && a.heightCm === b.heightCm && a.price === b.price && a.edgeMarginMm === b.edgeMarginMm && a.gapMm === b.gapMm && a.allowRotate === b.allowRotate;

/** Chỉ để xem trước số tiền đang gõ; máy chủ mới là nơi kiểm tra chính thức. */
function pricePreview(text: string): string | null {
  const s = text.trim();
  if (s === "" || (s.includes(",") && s.includes("."))) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? `${formatDong(n)} đồng` : null;
}

/**
 * Mục "Tấm vật liệu (dùng để báo giá)" của trang sửa chất liệu. Lưu riêng bằng nút của mục này (qua saveMaterialStock ở máy chủ,
 * có ghi lịch sử), không đi chung với nút "Lưu chất liệu". Ô trống = chưa có dữ liệu, không tự điền giá trị mẫu.
 */
export function MaterialStockForm({ materialId, initial }: { materialId: string; initial: StockFormValues }) {
  const [values, setValues] = useState<StockFormValues>(initial);
  const [saved, setSaved] = useState<StockFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = !same(values, saved);
  const preview = pricePreview(values.price);

  const set = <K extends keyof StockFormValues>(key: K, value: StockFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setError(null);
  };

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await saveMaterialStockAction(materialId, values);
      if (r.error) {
        setError(r.error);
        return;
      }
      if (r.values) {
        setValues(r.values);
        setSaved(r.values);
      }
      toast.success(r.ok ?? "Đã lưu thông số tấm.");
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-labelledby="stock-title">
      <div>
        <h2 id="stock-title" className="sr-only">
          Tấm vật liệu (dùng để báo giá)
        </h2>
        <p className="text-xs text-muted-foreground">{HISTORY_NOTE}</p>
        <p className="text-xs text-muted-foreground">Mục này có nút lưu riêng bên dưới, không nằm trong nút &quot;Lưu chất liệu&quot; ở tab khác.</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stockWidthCm">Rộng tấm (cm)</Label>
          <Input id="stockWidthCm" inputMode="decimal" autoComplete="off" placeholder="Chưa có" value={values.widthCm} onChange={(e) => set("widthCm", e.target.value)} className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stockHeightCm">Cao tấm (cm)</Label>
          <Input id="stockHeightCm" inputMode="decimal" autoComplete="off" placeholder="Chưa có" value={values.heightCm} onChange={(e) => set("heightCm", e.target.value)} className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stockPrice">Giá một tấm (đồng)</Label>
          <Input id="stockPrice" inputMode="decimal" autoComplete="off" placeholder="Chưa có" value={values.price} onChange={(e) => set("price", e.target.value)} className="h-10" />
          <p className="text-xs text-muted-foreground">{preview ?? "Gõ số liền, không dấu chấm ngăn nghìn."}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stockEdgeMarginMm">Lề tấm (mm)</Label>
          <Input id="stockEdgeMarginMm" inputMode="decimal" autoComplete="off" placeholder="Chưa có" value={values.edgeMarginMm} onChange={(e) => set("edgeMarginMm", e.target.value)} className="h-10" />
          <p className="text-xs text-muted-foreground">Phần chừa quanh mép tấm, không đặt logo vào. Nhập 0 nếu không chừa.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stockGapMm">Khoảng cách giữa các logo (mm)</Label>
          <Input id="stockGapMm" inputMode="decimal" autoComplete="off" placeholder="Chưa có" value={values.gapMm} onChange={(e) => set("gapMm", e.target.value)} className="h-10" />
          <p className="text-xs text-muted-foreground">Nhập 0 nếu cho phép sát nhau. Để trống thì dùng khoảng cách mặc định chung (nếu đã thiết lập).</p>
        </div>
        <label className="flex items-center gap-2 self-center text-sm">
          <input type="checkbox" checked={values.allowRotate} onChange={(e) => set("allowRotate", e.target.checked)} className="size-4" />
          Cho phép xoay logo khi xếp lên tấm
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-10 px-5" disabled={pending || !dirty}>
          {pending && <Loader2Icon className="animate-spin" />}
          {pending ? "Đang lưu..." : "Lưu thông số tấm"}
        </Button>
        {dirty && !pending && <span className="text-xs text-amber-700">Có thay đổi chưa lưu.</span>}
      </div>
    </form>
  );
}
