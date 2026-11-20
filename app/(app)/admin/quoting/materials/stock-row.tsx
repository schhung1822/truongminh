"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckIcon, Loader2Icon, SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { saveMaterialStockAction } from "../actions";
import type { MaterialRow } from "../data";
import { numToText } from "../format";
import { NumberInput } from "../number-input";
import { MATERIAL_MISSING_SHORT } from "../status";
import { sameRaw, stockToRaw, type StockRaw } from "../stock-form";

/** Một dòng bảng tấm vật liệu: ô nhập trực tiếp (cm, đồng, mm), nút Lưu riêng của dòng và thông báo Đã lưu hoặc lỗi. */
export function StockRow({ row, defaultGapMm, selected, onToggle }: { row: MaterialRow; defaultGapMm: number | null; selected: boolean; onToggle: () => void }) {
  const baseline = stockToRaw({ stockWidthMm: row.stockWidthMm, stockHeightMm: row.stockHeightMm, stockPrice: row.stockPrice, edgeMarginMm: row.edgeMarginMm, gapMm: row.gapMm, allowRotate: row.allowRotate });
  const sig = JSON.stringify(baseline);
  const [draft, setDraft] = useState<StockRaw>(baseline);
  const [prevSig, setPrevSig] = useState(sig);
  const [status, setStatus] = useState<{ kind: "saved" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  // dữ liệu thật vừa đổi (lưu xong, hoặc đổi hàng loạt): nạp lại ô nhập theo dữ liệu mới
  if (sig !== prevSig) {
    setPrevSig(sig);
    setDraft(baseline);
  }

  const dirty = !sameRaw(draft, baseline);
  const set = (patch: Partial<StockRaw>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setStatus(null);
  };

  function save() {
    start(async () => {
      const r = await saveMaterialStockAction(row.id, draft);
      setStatus(r.error ? { kind: "error", text: r.error } : { kind: "saved", text: r.ok ?? "Đã lưu." });
    });
  }

  const label = (what: string) => `${what} của ${row.code}`;
  const machineBad = row.machine === "none" || row.machine === "missing";

  return (
    <TableRow data-state={selected ? "selected" : undefined} className={cn("align-top", dirty && "bg-amber-50/60 dark:bg-amber-950/20")}>
      <TableCell className="pt-3">
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Chọn ${row.code}`} />
      </TableCell>
      <TableCell className="max-w-56 min-w-40 whitespace-normal">
        <Link href={`/admin/materials/${row.id}`} className="font-medium underline-offset-4 hover:underline">
          {row.code}
        </Link>
        <div className="text-sm">{row.name}</div>
        <div className="text-xs text-muted-foreground">
          {row.group}
          {row.techniqueLabel ? ` · ${row.techniqueLabel}` : ""}
        </div>
      </TableCell>
      <TableCell>
        <NumberInput value={draft.widthCm} onChange={(v) => set({ widthCm: v })} placeholder="Chưa có" aria-label={label("Rộng tấm (cm)")} className="h-8 w-24 text-right tabular-nums" />
      </TableCell>
      <TableCell>
        <NumberInput value={draft.heightCm} onChange={(v) => set({ heightCm: v })} placeholder="Chưa có" aria-label={label("Cao tấm (cm)")} className="h-8 w-24 text-right tabular-nums" />
      </TableCell>
      <TableCell>
        <NumberInput kind="money" value={draft.price} onChange={(v) => set({ price: v })} placeholder="Chưa có" aria-label={label("Giá tấm (đồng)")} className="h-8 w-32 text-right tabular-nums" />
      </TableCell>
      <TableCell>
        <NumberInput value={draft.edgeMarginMm} onChange={(v) => set({ edgeMarginMm: v })} placeholder="Chưa có" aria-label={label("Lề tấm (mm)")} className="h-8 w-20 text-right tabular-nums" />
      </TableCell>
      <TableCell>
        <NumberInput
          value={draft.gapMm}
          onChange={(v) => set({ gapMm: v })}
          placeholder={defaultGapMm !== null ? `Chung: ${numToText(defaultGapMm)}` : "Chưa có"}
          aria-label={label("Khoảng cách giữa logo (mm), để trống là dùng mặc định chung")}
          className="h-8 w-24 text-right tabular-nums"
        />
      </TableCell>
      <TableCell className="pt-3">
        <Switch checked={draft.allowRotate} onCheckedChange={(c) => set({ allowRotate: c })} aria-label={label("Cho xoay logo")} />
      </TableCell>
      <TableCell className="max-w-44 whitespace-normal">
        {row.missing.length === 0 && !machineBad && row.machine !== null ? (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">Đủ</span>
        ) : (
          <div className="flex flex-col gap-0.5 text-xs">
            {row.missing.length > 0 && <span className="text-red-700 dark:text-red-400">Thiếu: {row.missing.map((c) => MATERIAL_MISSING_SHORT[c] ?? c).join(", ")}</span>}
            {machineBad && (
              <Link href="/admin/quoting/machines" className="text-amber-700 underline-offset-4 hover:underline dark:text-amber-400">
                Thông số máy chưa đủ
              </Link>
            )}
          </div>
        )}
      </TableCell>
      <TableCell className="min-w-28 whitespace-normal">
        <Button type="button" size="sm" onClick={save} disabled={!dirty || pending} aria-label={`Lưu ${row.code}`}>
          {pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          Lưu
        </Button>
        {status && (
          <p role="status" className={cn("mt-1 flex items-start gap-1 text-xs", status.kind === "saved" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
            {status.kind === "saved" && <CheckIcon className="mt-0.5 size-3 shrink-0" />}
            {status.text}
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}
