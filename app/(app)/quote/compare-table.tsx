"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CompareItem } from "./actions";
import { fmtInt, fmtPct, fmtVnd, unionQuantities } from "./format";
import { MissingList } from "./missing-box";

/** Bảng so sánh cạnh nhau: logo/tấm, hiệu suất và đơn giá ở từng mốc. Chất liệu thiếu thông số thì KHÔNG có số giá. */
export function CompareTable({ items, primaryId }: { items: CompareItem[]; primaryId: string }) {
  const quantities = unionQuantities(items.map((i) => (i.view.ok ? i.view.lines.map((l) => l.quantity) : [])));

  // đơn giá thấp nhất ở mỗi mốc (chỉ so các giá máy chủ đã trả về)
  const cheapest = new Map<number, number>();
  for (const q of quantities) {
    const prices = items.flatMap((i) => (i.view.ok ? i.view.lines.filter((l) => l.quantity === q).map((l) => l.unitPrice) : []));
    if (prices.length > 1) cheapest.set(q, Math.min(...prices));
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-32">Chỉ tiêu</TableHead>
            {items.map((i) => (
              <TableHead key={i.materialId} className="min-w-44 whitespace-normal py-2 align-top">
                <span className="block">{i.materialLabel}</span>
                {i.materialId === primaryId && <span className="text-xs font-normal text-muted-foreground">(đang chọn)</span>}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="text-muted-foreground">Tình trạng</TableCell>
            {items.map((i) => (
              <TableCell key={i.materialId} className="align-top whitespace-normal">
                {i.view.ok ? (
                  <span className="text-emerald-700 dark:text-emerald-400">Đủ thông số</span>
                ) : i.view.reason === "MISSING" ? (
                  <details>
                    <summary className="cursor-pointer font-medium text-amber-700 dark:text-amber-400">Thiếu thông số</summary>
                    <div className="mt-2">
                      <MissingList missing={i.view.missing} />
                    </div>
                  </details>
                ) : (
                  <span className="text-destructive">{i.view.error}</span>
                )}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell className="text-muted-foreground">Logo/tấm</TableCell>
            {items.map((i) => (
              <TableCell key={i.materialId} className="tabular-nums">
                {i.view.ok ? fmtInt(i.view.perSheet) : "—"}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell className="text-muted-foreground">Hiệu suất</TableCell>
            {items.map((i) => (
              <TableCell key={i.materialId} className="tabular-nums">
                {i.view.ok ? fmtPct(i.view.efficiencyPct) : "—"}
              </TableCell>
            ))}
          </TableRow>
          {quantities.map((q) => (
            <TableRow key={q}>
              <TableCell className="text-muted-foreground">Đơn giá, {fmtInt(q)} cái</TableCell>
              {items.map((i) => {
                if (!i.view.ok) {
                  return (
                    <TableCell key={i.materialId} className="text-xs text-muted-foreground">
                      {i.view.reason === "MISSING" ? "Thiếu thông số" : "Không xếp được"}
                    </TableCell>
                  );
                }
                const line = i.view.lines.find((l) => l.quantity === q);
                if (!line) return <TableCell key={i.materialId}>—</TableCell>;
                const best = cheapest.get(q) === line.unitPrice;
                return (
                  <TableCell key={i.materialId} className={cn("tabular-nums", best && "font-semibold text-emerald-700 dark:text-emerald-400")}>
                    {fmtVnd(line.unitPrice)}
                    {best && <span className="ml-1 text-xs font-normal">thấp nhất</span>}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
