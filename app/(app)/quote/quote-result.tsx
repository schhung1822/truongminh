"use client";

import { LightbulbIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { QuoteResponse } from "@/lib/quoting/store";
import type { SizeSuggestion } from "@/lib/quoting/suggest";
import { fmtCm, fmtInt, fmtPct, suggestionText } from "./format";
import { LayoutPanel } from "./layout-panel";
import { MissingBox } from "./missing-box";
import { CopyPriceButton, CostDetails, InternalDetails, PriceTable } from "./price-parts";

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function WarningBox({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <TriangleAlertIcon className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-col gap-1">
        <p className="font-semibold">Lưu ý về logo và bố cục</p>
        <ul className="flex list-disc flex-col gap-0.5 pl-4">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Kết quả một lần tính giá: cảnh báo, số chính, hình bố cục, bảng giá, gợi ý, chi tiết nội bộ (và giá vốn nếu là admin). */
export function QuoteResultView({
  data,
  brandName,
  logoUrl,
  stale,
  onApplySuggestion,
}: {
  data: QuoteResponse;
  brandName: string;
  logoUrl: string | null;
  /** thông số trong form đã đổi sau lần tính này */
  stale: boolean;
  onApplySuggestion: (s: SizeSuggestion) => void;
}) {
  const { view, logo } = data;
  const sizeText = `${fmtCm(logo.widthMm)} x ${fmtCm(logo.heightMm)} cm`;
  const warnings = [...new Set([...logo.warnings, ...(view.ok ? view.warnings : [])])];

  return (
    <div className="flex flex-col gap-4">
      {stale && (
        <p role="status" className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Bạn đã đổi thông số ở trên. Kết quả dưới đây là của lần tính trước, bấm <b>Tính giá</b> để cập nhật.
        </p>
      )}

      <WarningBox warnings={warnings} />

      {!view.ok && view.reason === "MISSING" && <MissingBox message={view.message} missing={view.missing} />}
      {!view.ok && view.reason === "NESTING" && (
        <div role="alert" className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <TriangleAlertIcon className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Không xếp được logo lên tấm</p>
            <p>{view.error}</p>
            <p className="mt-1 text-muted-foreground">Thử giảm kích thước logo hoặc chọn chất liệu có tấm lớn hơn.</p>
          </div>
        </div>
      )}

      {view.ok && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Logo mỗi tấm" value={fmtInt(view.perSheet)} />
            <Stat label="Hiệu suất dùng tấm" value={fmtPct(view.efficiencyPct)} />
            <Stat label="Kích thước logo" value={sizeText} />
            <Stat label="Phương án xếp" value={<span className="text-base">{view.layout.label || "—"}</span>} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Bố cục xếp logo trên tấm</CardTitle>
              <CardDescription>{data.materialLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              <LayoutPanel
                layout={{ stock: view.layout.stock, placements: view.layout.placements, label: view.layout.label }}
                logoUrl={logoUrl}
                title={`${brandName ? `${brandName} · ` : ""}${data.materialLabel} · logo ${sizeText}`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bảng giá theo số lượng</CardTitle>
              <CardDescription>Đơn giá và thành tiền theo từng mốc số lượng.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <PriceTable lines={view.lines} />
              <div>
                <CopyPriceButton lines={view.lines} title={`Báo giá logo ${sizeText}, chất liệu ${data.materialLabel}`} />
              </div>
            </CardContent>
          </Card>

          {(() => {
            const better = data.suggestions.filter((s) => s.perSheet > view.perSheet);
            if (better.length === 0) return null;
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LightbulbIcon className="size-5 text-amber-500" />
                    Gợi ý đổi kích thước
                  </CardTitle>
                  <CardDescription>Đổi nhẹ kích thước logo có thể xếp được nhiều logo hơn trên mỗi tấm, giá mỗi logo thường giảm theo.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-2">
                    {better.map((s) => (
                      <li key={`${s.widthMm}-${s.heightMm}`} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                        <p className="min-w-0 flex-1 text-sm">{suggestionText({ widthMm: logo.widthMm, perSheet: view.perSheet }, s)}.</p>
                        <Button type="button" variant="outline" className="h-9" onClick={() => onApplySuggestion(s)}>
                          Thử kích thước này
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })()}

          <InternalDetails
            lines={view.lines}
            efficiencyPct={view.efficiencyPct}
            perSheet={view.perSheet}
            layoutLabel={view.layout.label}
            strategy={view.layout.strategy}
            candidates={view.layout.candidates}
          />

          {"params" in view && view.params ? <CostDetails params={view.params} lines={view.lines} /> : null}
        </>
      )}
    </div>
  );
}
