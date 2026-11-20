"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowRightIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { applyBulkPriceAction, applyBulkStockAction, type BulkReport } from "../actions";
import { MAX_BULK_ROWS, parsePriceSpec, parseStockPatch, previewPriceChange, previewStockPatch, type PriceChangeSpec, type StockFieldsIn } from "../bulk";
import { ConfirmDialog } from "../confirm-dialog";
import type { MaterialRow } from "../data";
import { formatVnd, groupDigits, mmToCm, NO_DATA } from "../format";
import { NumberInput } from "../number-input";

const fmtCm = (mm: number | null) => (mm === null ? "Chưa có" : `${groupDigits(mmToCm(mm))} cm`);
const fmtMm = (mm: number | null) => (mm === null ? "Chưa có" : `${groupDigits(mm)} mm`);

function describeSpec(spec: PriceChangeSpec): string {
  if (spec.mode === "set") return `Đặt giá tấm mới: ${formatVnd(spec.value)}`;
  const sign = spec.value >= 0 ? "Tăng" : "Giảm";
  return `${sign} giá tấm ${groupDigits(Math.abs(spec.value))}%${spec.roundTo > 1 ? `, làm tròn tới ${groupDigits(spec.roundTo)} đ` : ""}`;
}

const PillButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} aria-pressed={active} className={cn("rounded-full border px-3.5 py-1.5 text-sm transition-colors", active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
    {children}
  </button>
);

/**
 * Đổi hàng loạt cho các dòng đã chọn: (a) giá tấm tuyệt đối hoặc theo %, (b) cùng kích thước tấm / lề / khoảng cách.
 * Luôn có bảng xem trước, rồi hộp xác nhận, rồi mới lưu. Máy chủ tính lại trên dữ liệu thật và lưu từng dòng riêng (có lịch sử từng chất liệu).
 */
export function BulkTools({ rows, onApplied }: { rows: MaterialRow[]; onApplied: () => void }) {
  const [tab, setTab] = useState<"price" | "stock">("price");
  const [mode, setMode] = useState<"set" | "percent">("percent");
  const [value, setValue] = useState("");
  const [roundTo, setRoundTo] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [edgeMarginMm, setEdgeMarginMm] = useState("");
  const [gapMm, setGapMm] = useState("");
  const [clearGap, setClearGap] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string; report?: BulkReport } | null>(null);

  const tooMany = rows.length > MAX_BULK_ROWS;

  const priceSpec = useMemo(() => parsePriceSpec({ mode, value, roundTo }), [mode, value, roundTo]);
  const pricePreview = useMemo(() => ("spec" in priceSpec ? previewPriceChange(rows, priceSpec.spec) : []), [rows, priceSpec]);
  const stockPatch = useMemo(() => parseStockPatch({ widthCm, heightCm, edgeMarginMm, gapMm, clearGap }), [widthCm, heightCm, edgeMarginMm, gapMm, clearGap]);
  const stockPreview = useMemo(() => ("patch" in stockPatch ? previewStockPatch(rows, stockPatch.patch) : []), [rows, stockPatch]);

  const priceCounts = {
    change: pricePreview.filter((p) => p.status === "change").length,
    same: pricePreview.filter((p) => p.status === "same").length,
    skip: pricePreview.filter((p) => p.status === "skip" || p.status === "error").length,
  };
  const stockChange = stockPreview.filter((p) => p.changed.length > 0).length;

  const canApply = !tooMany && rows.length > 0 && (tab === "price" ? "spec" in priceSpec && priceCounts.change > 0 : "patch" in stockPatch && stockChange > 0);

  function apply() {
    const ids = rows.map((r) => r.id);
    start(async () => {
      const r = tab === "price" ? await applyBulkPriceAction({ ids, spec: { mode, value, roundTo } }) : await applyBulkStockAction({ ids, patch: { widthCm, heightCm, edgeMarginMm, gapMm, clearGap } });
      setConfirmOpen(false);
      if (r.error) {
        toast.error(r.error);
        setResult({ ok: false, text: r.error, report: r.report });
        return;
      }
      toast.success(r.ok ?? "Đã áp dụng.");
      setResult({ ok: true, text: r.ok ?? "Đã áp dụng.", report: r.report });
      // xóa ô đã nhập để lần chọn sau không vô tình áp dụng lại cùng một mức (ví dụ tăng 5% hai lần)
      setValue("");
      setRoundTo("");
      setWidthCm("");
      setHeightCm("");
      setEdgeMarginMm("");
      setGapMm("");
      setClearGap(false);
      onApplied();
    });
  }

  if (rows.length === 0) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>Đổi hàng loạt</CardTitle>
          <CardDescription>Tích chọn các dòng trong bảng (hoặc bấm &quot;Chọn tất cả đang lọc&quot;) để đổi giá tấm hoặc áp dụng cùng kích thước, lề, khoảng cách. Luôn có bảng xem trước và hộp xác nhận.</CardDescription>
        </CardHeader>
        {result && (
          <CardContent>
            <ResultPanel result={result} onClose={() => setResult(null)} />
          </CardContent>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Đổi hàng loạt cho {rows.length} chất liệu đã chọn</CardTitle>
        <CardDescription>Xem trước giá cũ và giá mới của từng dòng, rồi xác nhận. Mỗi chất liệu được lưu riêng nên lịch sử thay đổi ghi từng chất liệu. Tối đa {MAX_BULK_ROWS} dòng mỗi lần.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {tooMany && <p className="rounded-lg border border-red-300 bg-red-50 p-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">Đang chọn {rows.length} dòng, vượt giới hạn {MAX_BULK_ROWS}. Hãy bỏ bớt hoặc lọc thêm.</p>}

        <div className="flex flex-wrap gap-2" role="group" aria-label="Chọn việc cần làm">
          <PillButton active={tab === "price"} onClick={() => setTab("price")}>
            Đổi giá tấm
          </PillButton>
          <PillButton active={tab === "stock"} onClick={() => setTab("stock")}>
            Áp dụng cùng kích thước, lề, khoảng cách
          </PillButton>
        </div>

        {tab === "price" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Cách đổi giá">
              <PillButton active={mode === "percent"} onClick={() => setMode("percent")}>
                Tăng hoặc giảm theo %
              </PillButton>
              <PillButton active={mode === "set"} onClick={() => setMode("set")}>
                Đặt giá mới cho tất cả
              </PillButton>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bulk-value">{mode === "percent" ? "Tăng hoặc giảm (%)" : "Giá tấm mới (đồng)"}</Label>
                <NumberInput id="bulk-value" kind={mode === "set" ? "money" : "plain"} unit={mode === "percent" ? "%" : "đồng"} value={value} onChange={setValue} placeholder={mode === "percent" ? "Ví dụ 5 (tăng 5%), -3 (giảm 3%)" : "Ví dụ 120.000"} className="h-10" />
                <p className="text-xs text-muted-foreground">
                  {mode === "percent" ? "Dòng chưa có giá cũ sẽ bị bỏ qua (không có gì để tăng giảm) và được báo rõ." : "Mọi dòng đã chọn đều nhận giá này, kể cả dòng chưa có giá."}
                </p>
              </div>
              {mode === "percent" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bulk-round">Làm tròn giá mới tới (đồng, tùy chọn)</Label>
                  <NumberInput id="bulk-round" kind="money" unit="đồng" value={roundTo} onChange={setRoundTo} placeholder="Để trống là tròn tới 1 đồng" className="h-10" />
                  <p className="text-xs text-muted-foreground">Ví dụ nhập 1.000 để giá mới luôn tròn nghìn.</p>
                </div>
              )}
            </div>
            {"error" in priceSpec && value.trim() !== "" && <p className="text-sm text-red-700 dark:text-red-400">{priceSpec.error}</p>}
            {"spec" in priceSpec && (
              <>
                <p className="text-sm">
                  <b>{describeSpec(priceSpec.spec)}</b>: {priceCounts.change} dòng đổi giá, {priceCounts.same} dòng không đổi{priceCounts.skip > 0 ? `, ${priceCounts.skip} dòng bỏ qua` : ""}.
                </p>
                <div className="max-h-80 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-3">Mã</TableHead>
                        <TableHead>Tên</TableHead>
                        <TableHead className="text-right">Giá cũ</TableHead>
                        <TableHead />
                        <TableHead className="text-right">Giá mới</TableHead>
                        <TableHead className="pr-3">Ghi chú</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pricePreview.map((p) => (
                        <TableRow key={p.id} className={cn(p.status === "skip" && "text-amber-800 dark:text-amber-300", p.status === "error" && "text-red-700 dark:text-red-400", p.status === "same" && "text-muted-foreground")}>
                          <TableCell className="pl-3 font-medium">{p.code}</TableCell>
                          <TableCell className="max-w-48 truncate">{p.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{p.oldPrice === null ? NO_DATA : formatVnd(p.oldPrice)}</TableCell>
                          <TableCell className="px-0 text-muted-foreground">
                            <ArrowRightIcon className="size-3.5" />
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{p.newPrice === null ? "—" : formatVnd(p.newPrice)}</TableCell>
                          <TableCell className="pr-3 text-xs whitespace-normal">{p.status === "same" ? "Không đổi" : (p.reason ?? "")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Chỉ ô nào bạn nhập mới được áp dụng; ô để trống giữ nguyên giá trị của từng chất liệu.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bulk-w">Rộng tấm</Label>
                <NumberInput id="bulk-w" unit="cm" value={widthCm} onChange={setWidthCm} placeholder="Giữ nguyên" className="h-10" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bulk-h">Cao tấm</Label>
                <NumberInput id="bulk-h" unit="cm" value={heightCm} onChange={setHeightCm} placeholder="Giữ nguyên" className="h-10" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bulk-e">Lề tấm</Label>
                <NumberInput id="bulk-e" unit="mm" value={edgeMarginMm} onChange={setEdgeMarginMm} placeholder="Giữ nguyên" className="h-10" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bulk-g">Khoảng cách giữa logo</Label>
                <NumberInput id="bulk-g" unit="mm" value={gapMm} onChange={(v) => { setGapMm(v); if (v.trim() !== "") setClearGap(false); }} placeholder="Giữ nguyên" className="h-10" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={clearGap} onCheckedChange={(c) => { setClearGap(c === true); if (c === true) setGapMm(""); }} />
              Xóa khoảng cách riêng (các chất liệu này dùng khoảng cách mặc định chung)
            </label>
            {"error" in stockPatch && [widthCm, heightCm, edgeMarginMm, gapMm].some((x) => x.trim() !== "") && <p className="text-sm text-red-700 dark:text-red-400">{stockPatch.error}</p>}
            {"patch" in stockPatch && (
              <>
                <p className="text-sm">
                  <b>{stockChange}</b> dòng có thay đổi, {stockPreview.length - stockChange} dòng đã giống sẵn.
                </p>
                <div className="max-h-80 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-3">Mã</TableHead>
                        <TableHead>Rộng tấm</TableHead>
                        <TableHead>Cao tấm</TableHead>
                        <TableHead>Lề tấm</TableHead>
                        <TableHead className="pr-3">Khoảng cách</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockPreview.map((p) => {
                        const cell = (k: keyof StockFieldsIn, f: (n: number | null) => string) =>
                          p.changed.includes(k) ? (
                            <span className="font-medium">
                              <span className="text-muted-foreground line-through">{f(p.before[k])}</span> → {p.after[k] === null && k === "gapMm" ? "Mặc định chung" : f(p.after[k])}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{f(p.before[k])}</span>
                          );
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="pl-3 font-medium">{p.code}</TableCell>
                            <TableCell>{cell("stockWidthMm", fmtCm)}</TableCell>
                            <TableCell>{cell("stockHeightMm", fmtCm)}</TableCell>
                            <TableCell>{cell("edgeMarginMm", fmtMm)}</TableCell>
                            <TableCell className="pr-3">{cell("gapMm", fmtMm)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        )}

        <div>
          <Button type="button" className="h-10" disabled={!canApply || pending} onClick={() => setConfirmOpen(true)}>
            Áp dụng cho {tab === "price" ? priceCounts.change : stockChange} chất liệu
          </Button>
        </div>

        {result && <ResultPanel result={result} onClose={() => setResult(null)} />}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={tab === "price" ? "Xác nhận đổi giá tấm" : "Xác nhận áp dụng kích thước, lề, khoảng cách"}
        description="Thông số ảnh hưởng trực tiếp tới giá bán. Mỗi chất liệu được lưu riêng và ghi vào Lịch sử thay đổi."
        confirmLabel={pending ? "Đang áp dụng..." : "Áp dụng"}
        cancelLabel="Quay lại"
        pending={pending}
        onConfirm={apply}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {tab === "price" && "spec" in priceSpec ? (
            <>
              <li>{describeSpec(priceSpec.spec)}.</li>
              <li>
                {priceCounts.change} chất liệu sẽ đổi giá; {priceCounts.same} không đổi; {priceCounts.skip} bỏ qua.
              </li>
            </>
          ) : (
            <li>{stockChange} chất liệu sẽ được cập nhật theo bảng xem trước; ô để trống giữ nguyên.</li>
          )}
          <li>Muốn quay lại giá trước phải đổi lại bằng tay (xem giá cũ ở Lịch sử thay đổi).</li>
        </ul>
      </ConfirmDialog>
    </Card>
  );
}

function ResultPanel({ result, onClose }: { result: { ok: boolean; text: string; report?: BulkReport }; onClose: () => void }) {
  const rep = result.report;
  return (
    <div className={cn("rounded-lg border p-3 text-sm", result.ok ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40" : "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40")} role="status">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{result.text}</p>
        <Button type="button" variant="ghost" size="icon-xs" onClick={onClose} aria-label="Đóng thông báo">
          <XIcon />
        </Button>
      </div>
      {rep && (rep.skipped.length > 0 || rep.failed.length > 0) && (
        <ul className="mt-2 max-h-40 list-disc overflow-auto pl-5 text-xs">
          {rep.failed.map((f, i) => (
            <li key={`f${i}`} className="text-red-700 dark:text-red-400">
              {f.code}: lỗi, {f.reason}
            </li>
          ))}
          {rep.skipped.map((s, i) => (
            <li key={`s${i}`}>
              {s.code}: bỏ qua, {s.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

