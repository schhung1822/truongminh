"use client";

import { useMemo, useState } from "react";
import { ArrowUpIcon, SearchIcon, XIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export type PickerMaterial = { id: string; code: string; name: string; kind: string };

export const MAX_SUGGESTED_MATERIALS = 12;

/** Bỏ dấu để tìm "van xoan" ra "Vân xoắn". */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

/**
 * Chọn vật liệu gợi ý từ thư viện chất liệu cho một bài tìm nhà sản xuất (v1.1 mục 6). Thứ tự chọn có ý nghĩa: câu mời chỉ
 * nhắc MỘT hoặc HAI vật liệu đứng đầu, nên có nút đưa một vật liệu lên đầu. `value` là danh sách mã theo thứ tự.
 */
export function MaterialPicker({ materials, value, onChange }: { materials: PickerMaterial[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const selected = value.map((id) => byId.get(id)).filter((m): m is PickerMaterial => !!m);
  const term = fold(q.trim());
  const shown = term ? materials.filter((m) => fold(`${m.code} ${m.name} ${m.kind}`).includes(term)) : materials;
  const full = value.length >= MAX_SUGGESTED_MATERIALS;

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : full ? value : [...value, id]);

  if (materials.length === 0) return <p className="text-sm text-muted-foreground">Thư viện chất liệu chưa có chất liệu nào đang bật (Thư viện mẫu &gt; Chất liệu).</p>;

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 ? (
        <ol className="flex flex-col gap-1">
          {selected.map((m, i) => (
            <li key={m.id} className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm">
              <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">
                <b>{m.name}</b> <span className="text-muted-foreground">· {m.code}{m.kind ? ` · ${m.kind}` : ""}</span>
              </span>
              {i < 2 && <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">nhắc trong câu mời</span>}
              {i > 0 && (
                <button type="button" title="Đưa lên đầu" aria-label={`Đưa ${m.name} lên đầu`} className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => onChange([m.id, ...value.filter((x) => x !== m.id)])}>
                  <ArrowUpIcon className="size-3.5" />
                </button>
              )}
              <button type="button" title="Bỏ" aria-label={`Bỏ ${m.name}`} className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => toggle(m.id)}>
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed p-2 text-sm text-muted-foreground">Chưa chọn vật liệu nào: câu mời sẽ không nêu tên vật liệu cụ thể.</p>
      )}

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm chất liệu theo tên, mã, nhóm, công nghệ" className="h-9 pl-9" aria-label="Tìm chất liệu" />
      </div>
      <ul className="max-h-52 overflow-y-auto rounded-lg border">
        {shown.length === 0 && <li className="p-2 text-sm text-muted-foreground">Không có chất liệu nào khớp.</li>}
        {shown.map((m) => {
          const on = value.includes(m.id);
          return (
            <li key={m.id}>
              <label className={`flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted/60 ${!on && full ? "opacity-50" : ""}`}>
                <Checkbox checked={on} disabled={!on && full} onCheckedChange={() => toggle(m.id)} aria-label={`Chọn ${m.name}`} />
                <span className="min-w-0 flex-1 truncate">
                  {m.name} <span className="text-muted-foreground">· {m.code}{m.kind ? ` · ${m.kind}` : ""}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Đã chọn {value.length}/{MAX_SUGGESTED_MATERIALS}. Câu mời chỉ nhắc một hoặc hai vật liệu đứng đầu; AI (nếu bật) được xem cả danh sách để chọn cái hợp với comment.
      </p>
    </div>
  );
}
