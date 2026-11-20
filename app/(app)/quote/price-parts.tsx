"use client";

import { CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LAST_SHEET_LABEL, type QuoteLine } from "@/lib/quoting/types";
import { customerPriceText } from "@/lib/quoting/view";
import { copyToClipboard } from "./client-utils";
import { fmtDec, fmtInt, fmtPct, fmtVnd } from "./format";

/** Bảng giá theo mốc số lượng (sale được xem): số lượng, số tấm, đơn giá, thành tiền. */
export function PriceTable({ lines }: { lines: QuoteLine[] }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">Số lượng</TableHead>
            <TableHead className="text-right">Số tấm</TableHead>
            <TableHead className="text-right">Đơn giá</TableHead>
            <TableHead className="text-right">Thành tiền</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.quantity}>
              <TableCell className="text-right font-medium tabular-nums">{fmtInt(l.quantity)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtInt(l.sheetsNeeded)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtVnd(l.unitPrice)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{fmtVnd(l.totalPrice)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Sao chép bảng giá gửi khách: chỉ có số lượng, đơn giá, thành tiền (không có số tấm, phút máy hay giá vốn). */
export function CopyPriceButton({ lines, title, className }: { lines: QuoteLine[]; title: string; className?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className={className ?? "h-9"}
      disabled={lines.length === 0}
      onClick={() => void copyToClipboard(customerPriceText(lines, { title }), "Đã sao chép bảng giá gửi khách.")}
    >
      <CopyIcon />
      Sao chép bảng giá gửi khách
    </Button>
  );
}

/** Khối gập: tên + nội dung. Dùng thẻ details của trình duyệt (mặc định gập, bàn phím và đọc màn hình dùng được). */
export function Collapsible({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border bg-card">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm font-medium marker:content-none">
        <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
          ▸
        </span>
        <span>{title}</span>
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </summary>
      <div className="flex flex-col gap-4 border-t px-4 py-3">{children}</div>
    </details>
  );
}

export type CandidateRow = { strategy: string; label: string; count: number; efficiencyPct: number };

/** "Chi tiết nội bộ": phút máy, hiệu suất, phương án xếp và các phương án đã thử. Gập lại mặc định. */
export function InternalDetails({
  lines,
  efficiencyPct,
  perSheet,
  layoutLabel,
  strategy,
  candidates,
}: {
  lines: QuoteLine[];
  efficiencyPct: number;
  perSheet: number;
  layoutLabel: string;
  strategy: string;
  candidates?: CandidateRow[];
}) {
  return (
    <Collapsible title="Chi tiết nội bộ" hint="(không gửi cho khách)">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Phương án xếp</dt>
          <dd>{layoutLabel || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Số logo mỗi tấm</dt>
          <dd className="tabular-nums">{fmtInt(perSheet)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Hiệu suất dùng tấm</dt>
          <dd className="tabular-nums">{fmtPct(efficiencyPct)}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">Số tấm và thời gian máy theo từng mốc</p>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">Số lượng</TableHead>
                <TableHead className="text-right">Số tấm</TableHead>
                <TableHead className="text-right">Phút máy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.quantity}>
                  <TableCell className="text-right tabular-nums">{fmtInt(l.quantity)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(l.sheetsNeeded)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtDec(l.machineMinutes, 1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {candidates && candidates.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Các phương án xếp đã thử</p>
          <p className="text-xs text-muted-foreground">Hệ thống chọn phương án xếp được nhiều logo nhất; bằng nhau thì chọn cách đơn giản hơn.</p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phương án</TableHead>
                  <TableHead className="text-right">Logo/tấm</TableHead>
                  <TableHead className="text-right">Hiệu suất</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c, i) => (
                  <TableRow key={`${c.strategy}-${i}`}>
                    <TableCell className="whitespace-normal">{c.label || c.strategy}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInt(c.count)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPct(c.efficiencyPct)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.strategy === strategy ? "Được chọn" : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </Collapsible>
  );
}

/* ---------- Chi tiết giá vốn (CHỈ ADMIN) ---------- */

const MATERIAL_LABEL: Record<string, string> = {
  stockWidthMm: "Rộng tấm (mm)",
  stockHeightMm: "Cao tấm (mm)",
  stockPrice: "Giá một tấm (đ)",
  edgeMarginMm: "Lề tấm (mm)",
  gapMm: "Khoảng cách giữa logo (mm)",
  allowRotate: "Cho xoay 90°",
  technique: "Công nghệ",
};
const MACHINE_LABEL: Record<string, string> = {
  cutSpeedMmPerSec: "Tốc độ cắt (mm/giây)",
  engraveSpeedMm2PerSec: "Tốc độ khắc (mm²/giây)",
  setupMinutesPerJob: "Cài đặt mỗi đơn (phút)",
  sheetChangeMinutes: "Đổi tấm (phút)",
  machineCostPerHour: "Chi phí máy mỗi giờ (đ)",
  laborSecondsPerPiece: "Công mỗi sản phẩm (giây)",
  laborCostPerHour: "Chi phí công mỗi giờ (đ)",
  consumableCostPerM2: "Vật tư theo diện tích (đ/m²)",
};
const CONFIG_LABEL: Record<string, string> = {
  defaultGapMm: "Khoảng cách mặc định (mm)",
  lastSheetPolicy: "Cách tính tấm cuối",
  marginTiers: "Lãi cộng thêm theo bậc số lượng",
  quantities: "Các mốc số lượng chuẩn",
  roundTo: "Làm tròn đơn giá tới (đ)",
  engravePct: "% diện tích khắc theo mức",
};
const COST_COLUMNS: { key: string; label: string; digits: 0 | 1 }[] = [
  { key: "materialCost", label: "Vật liệu", digits: 0 },
  { key: "machineCost", label: "Máy", digits: 0 },
  { key: "laborCost", label: "Công", digits: 0 },
  { key: "consumableCost", label: "Vật tư", digits: 0 },
  { key: "totalCost", label: "Tổng vốn", digits: 0 },
  { key: "unitCost", label: "Vốn/cái", digits: 1 },
  { key: "markupPct", label: "Lãi cộng thêm", digits: 1 },
  { key: "unitPriceRaw", label: "Đơn giá trước làm tròn", digits: 1 },
];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);

function fmtNum(n: number): string {
  return Number.isInteger(n) ? fmtInt(n) : fmtDec(n, 2).replace(/,?0+$/, "");
}

function fmtParam(key: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Có" : "Không";
  if (typeof v === "number") return fmtNum(v);
  if (key === "lastSheetPolicy" && typeof v === "string") return LAST_SHEET_LABEL[v as keyof typeof LAST_SHEET_LABEL] ?? v;
  if (key === "quantities" && Array.isArray(v)) return v.map((x) => (typeof x === "number" ? fmtInt(x) : String(x))).join(", ") || "—";
  if (key === "marginTiers" && Array.isArray(v)) {
    const parts = v.filter(isRec).map((t) => `từ ${fmtNum(Number(t.fromQty))}${t.toQty == null ? " trở lên" : ` đến ${fmtNum(Number(t.toQty))}`}: +${fmtNum(Number(t.markupPct))}%`);
    return parts.join("; ") || "—";
  }
  if (key === "engravePct" && isRec(v)) {
    const parts = Object.entries(v).map(([k, x]) => `${k}: ${typeof x === "number" ? `${fmtNum(x)}%` : "—"}`);
    return parts.join("; ") || "—";
  }
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function costRows(raw: unknown): { quantity: number; cost: Rec }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!isRec(item)) return [];
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity)) return [];
    // báo giá đang tính: { quantity, cost: {...} }; báo giá đã lưu: { quantity, ...cost }
    return [{ quantity, cost: isRec(item.cost) ? item.cost : item }];
  });
}

function ParamList({ title, labels, data }: { title: string; labels: Record<string, string>; data: unknown }) {
  if (!isRec(data)) return null;
  const keys = [...Object.keys(labels).filter((k) => k in data), ...Object.keys(data).filter((k) => !(k in labels))];
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">{title}</p>
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {keys.map((k) => (
          <div key={k} className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{labels[k] ?? k}</dt>
            <dd className="tabular-nums">{fmtParam(k, data[k])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * "Chi tiết giá vốn": giá vốn từng thành phần theo mốc số lượng và thông số đã dùng khi tính.
 * CHỈ được render khi dữ liệu đến từ AdminQuoteView (view.params) hoặc StoredQuote.cost: sale không bao giờ có hai thứ này.
 */
export function CostDetails({ params, lines }: { params: unknown; lines: unknown }) {
  const rows = costRows(lines);
  const p = isRec(params) ? params : null;
  return (
    <Collapsible title="Chi tiết giá vốn" hint="(chỉ quản trị viên thấy)">
      {rows.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Giá vốn theo mốc số lượng (đồng)</p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">Số lượng</TableHead>
                  {COST_COLUMNS.map((c) => (
                    <TableHead key={c.key} className="text-right">
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.quantity}>
                    <TableCell className="text-right font-medium tabular-nums">{fmtInt(r.quantity)}</TableCell>
                    {COST_COLUMNS.map((c) => {
                      const v = Number(r.cost[c.key]);
                      const text = c.key === "markupPct" ? (Number.isFinite(v) ? `+${fmtDec(v, 1)}%` : "—") : c.digits === 0 ? fmtInt(v) : fmtDec(v, c.digits);
                      return (
                        <TableCell key={c.key} className="text-right tabular-nums">
                          {text}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      {p && (
        <>
          <ParamList title="Tấm vật liệu" labels={MATERIAL_LABEL} data={p.material} />
          <ParamList title="Thông số máy" labels={MACHINE_LABEL} data={p.machine} />
          <ParamList title="Cấu hình giá" labels={CONFIG_LABEL} data={p.config} />
          {p.engraveSharePct !== undefined && (
            <p className="text-sm">
              <span className="text-muted-foreground">Phần trăm diện tích logo được khắc:</span> {typeof p.engraveSharePct === "number" ? `${fmtNum(p.engraveSharePct)}%` : "—"}
            </p>
          )}
        </>
      )}
      {rows.length === 0 && !p && <p className="text-sm text-muted-foreground">Không có dữ liệu giá vốn.</p>}
    </Collapsible>
  );
}
