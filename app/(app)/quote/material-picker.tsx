"use client";

import { useMemo, useState } from "react";
import { CheckIcon, ChevronDownIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fold } from "./format";

/** Chất liệu đang bật, chỉ gồm thông tin để chọn (KHÔNG có giá tấm hay thông số tấm). */
export type MaterialOption = {
  id: string;
  code: string;
  name: string;
  groupName: string;
  printTech: string;
  thicknessMm: number | null;
};

export const materialLabel = (m: Pick<MaterialOption, "code" | "name">) => `${m.code} · ${m.name}`;

const MAX_ROWS = 80;

function subtitle(m: MaterialOption): string {
  return [m.groupName, m.printTech, m.thicknessMm ? `dày ${String(m.thicknessMm).replace(".", ",")} mm` : ""].filter(Boolean).join(" · ");
}

/** Danh sách chất liệu có ô tìm (mã, tên, nhóm, công nghệ; không phân biệt dấu). */
function SearchList({
  materials,
  isSelected,
  disabledIds,
  onPick,
  autoFocus,
}: {
  materials: MaterialOption[];
  isSelected: (id: string) => boolean;
  disabledIds?: Set<string>;
  onPick: (m: MaterialOption) => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const index = useMemo(() => materials.map((m) => ({ m, hay: fold(`${m.code} ${m.name} ${m.groupName} ${m.printTech}`) })), [materials]);
  const rows = useMemo(() => {
    const tokens = fold(q).split(/\s+/).filter(Boolean);
    return tokens.length ? index.filter((x) => tokens.every((t) => x.hay.includes(t))) : index;
  }, [index, q]);

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-popover p-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} // không gửi form tính giá khi bấm Enter trong ô tìm
          placeholder="Tìm theo mã, tên, nhóm hoặc công nghệ"
          className="h-10 pl-9"
          aria-label="Tìm chất liệu"
          autoFocus={autoFocus}
        />
      </div>
      <ul className="max-h-64 overflow-y-auto" role="listbox" aria-label="Danh sách chất liệu">
        {rows.slice(0, MAX_ROWS).map(({ m }) => {
          const selected = isSelected(m.id);
          const disabled = disabledIds?.has(m.id) ?? false;
          return (
            <li key={m.id} role="option" aria-selected={selected}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(m)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                  selected && "bg-muted",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{materialLabel(m)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{subtitle(m)}</span>
                </span>
                {selected && <CheckIcon className="size-4 shrink-0 text-primary" />}
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Không có chất liệu nào khớp &quot;{q}&quot;.</p>}
      {rows.length > MAX_ROWS && <p className="px-2 text-xs text-muted-foreground">Còn {rows.length - MAX_ROWS} chất liệu nữa, gõ thêm để lọc.</p>}
    </div>
  );
}

/** Chọn MỘT chất liệu (ô chọn có tìm kiếm). */
export function MaterialPicker({
  materials,
  value,
  onChange,
  id,
}: {
  materials: MaterialOption[];
  value: string;
  onChange: (id: string) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = materials.find((m) => m.id === value) ?? null;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        <span className={cn("min-w-0 flex-1 truncate", !current && "text-muted-foreground")}>{current ? materialLabel(current) : "Chọn chất liệu"}</span>
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {current && !open && <p className="truncate text-xs text-muted-foreground">{subtitle(current)}</p>}
      {open && (
        <SearchList
          materials={materials}
          isSelected={(mid) => mid === value}
          autoFocus
          onPick={(m) => {
            onChange(m.id);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Chọn thêm vài chất liệu khác để so sánh (tối đa `max`), không chọn trùng chất liệu chính. */
export function MaterialMultiPicker({
  materials,
  selected,
  excludeId,
  max,
  onChange,
}: {
  materials: MaterialOption[];
  selected: string[];
  excludeId: string;
  max: number;
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const chosen = selected.map((id) => materials.find((m) => m.id === id)).filter((m): m is MaterialOption => !!m);
  const full = selected.length >= max;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {chosen.map((m) => (
          <span key={m.id} className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs">
            <span className="truncate">{materialLabel(m)}</span>
            <button type="button" onClick={() => onChange(selected.filter((x) => x !== m.id))} aria-label={`Bỏ ${materialLabel(m)}`} className="rounded-full p-0.5 hover:bg-background">
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        {!full && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed px-3 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
          >
            <PlusIcon className="size-3.5" />
            Thêm chất liệu để so sánh
          </button>
        )}
      </div>
      {full && <p className="text-xs text-muted-foreground">Đã chọn đủ {max} chất liệu khác (mỗi lần so sánh tối đa {max + 1} chất liệu, tính cả chất liệu chính).</p>}
      {open && !full && (
        <SearchList
          materials={materials}
          isSelected={(id) => selected.includes(id)}
          disabledIds={new Set([excludeId])}
          autoFocus
          onPick={(m) => {
            if (m.id === excludeId) return;
            onChange(selected.includes(m.id) ? selected.filter((x) => x !== m.id) : [...selected, m.id]);
          }}
        />
      )}
    </div>
  );
}
