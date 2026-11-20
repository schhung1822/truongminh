"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, WandSparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { addTimeLogAction, timeDefaultsFromQuoteAction } from "../actions";
import { NumberInput } from "../number-input";
import { emptyTimeRaw, type TimeRaw } from "../time-form";

/** Ghi một đơn đã làm: tổng chiều dài cắt, diện tích khắc, số tấm và thời gian máy thực tế. Từ 8 đơn trở lên mới hiệu chỉnh được. */
export function TimeForm({ techniques }: { techniques: { value: string; label: string }[] }) {
  const [v, setV] = useState<TimeRaw>(emptyTimeRaw());
  const [quoteCode, setQuoteCode] = useState("");
  const [quoteQty, setQuoteQty] = useState("");
  const [saving, startSave] = useTransition();
  const [filling, startFill] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filled, setFilled] = useState<string | null>(null);

  const set = (patch: Partial<TimeRaw>) => {
    setV((p) => ({ ...p, ...patch }));
    setError(null);
  };

  function fill() {
    setError(null);
    setFilled(null);
    startFill(async () => {
      const r = await timeDefaultsFromQuoteAction(quoteCode, quoteQty);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setV((p) => ({ ...p, ...r.defaults, quoteId: quoteCode.trim() }));
      setFilled("Đã điền sẵn từ báo giá. Hãy nhập thời gian thực tế (phút) và kiểm tra lại các ô trước khi ghi.");
    });
  }

  function save() {
    startSave(async () => {
      const r = await addTimeLogAction(v);
      if (r.error) {
        setError(r.error);
        return;
      }
      toast.success(r.ok ?? "Đã ghi.");
      setV(emptyTimeRaw());
      setQuoteCode("");
      setQuoteQty("");
      setFilled(null);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ghi một đơn đã làm</CardTitle>
        <CardDescription>Số liệu này dùng để hiệu chỉnh tốc độ cắt, tốc độ khắc, thời gian cài đặt và đổi tấm ở mục Hiệu chỉnh. Cần ít nhất 8 đơn của cùng một công nghệ.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-2 text-sm font-medium">Điền sẵn từ báo giá (tùy chọn)</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-quote">Mã báo giá</Label>
              <Input id="t-quote" value={quoteCode} onChange={(e) => setQuoteCode(e.target.value)} placeholder="Dán mã báo giá" className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-qty">Mốc số lượng</Label>
              <NumberInput id="t-qty" kind="money" value={quoteQty} onChange={setQuoteQty} placeholder="Ví dụ 100" className="h-10" />
            </div>
            <Button type="button" variant="outline" className="h-10" onClick={fill} disabled={filling || !quoteCode.trim() || !quoteQty.trim()}>
              {filling ? <Loader2Icon className="animate-spin" /> : <WandSparklesIcon />}
              Điền sẵn
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Lấy chiều dài cắt, diện tích khắc và số tấm đã tính cho mốc số lượng đó. Chưa ghi gì cho tới khi bạn bấm Ghi đơn này.</p>
          {filled && <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">{filled}</p>}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label htmlFor="t-desc">Mô tả đơn</Label>
            <Input id="t-desc" value={v.description} onChange={(e) => set({ description: e.target.value })} maxLength={300} placeholder="Ví dụ: tên khách, chất liệu, số lượng" className="h-10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-tech">Công nghệ</Label>
            <NativeSelect id="t-tech" value={v.technique} onChange={(e) => set({ technique: e.target.value })}>
              <option value="">Chọn công nghệ</option>
              {techniques.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
              {v.technique && !techniques.some((t) => t.value === v.technique) && <option value={v.technique}>{v.technique}</option>}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-sheets">Số tấm đã dùng</Label>
            <NumberInput id="t-sheets" kind="money" unit="tấm" value={v.sheets} onChange={(x) => set({ sheets: x })} placeholder="Chưa có dữ liệu" className="h-10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-cut">Tổng chiều dài cắt của cả đơn</Label>
            <NumberInput id="t-cut" kind="money" unit="mm" value={v.totalCutMm} onChange={(x) => set({ totalCutMm: x })} placeholder="Chưa có dữ liệu" className="h-10" />
            <p className="text-xs text-muted-foreground">Chu vi một logo × số lượng. Đơn không cắt thì để trống.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-engrave">Tổng diện tích khắc của cả đơn</Label>
            <NumberInput id="t-engrave" kind="money" unit="mm2" value={v.engraveAreaMm2} onChange={(x) => set({ engraveAreaMm2: x })} placeholder="Chưa có dữ liệu" className="h-10" />
            <p className="text-xs text-muted-foreground">Phần diện tích phải khắc × số lượng. Đơn không khắc thì để trống.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-min">Thời gian máy thực tế</Label>
            <NumberInput id="t-min" unit="phút" value={v.actualMinutes} onChange={(x) => set({ actualMinutes: x })} placeholder="Chưa có dữ liệu" className="h-10" />
            <p className="text-xs text-muted-foreground">Tổng thời gian máy chạy cho cả đơn, gồm cài đặt và đổi tấm.</p>
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <div>
          <Button type="button" className="h-10" onClick={save} disabled={saving}>
            {saving && <Loader2Icon className="animate-spin" />}
            Ghi đơn này
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
