"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowDownIcon, ArrowUpIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { saveSheetAction } from "@/app/(app)/admin/sheets/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ASPECT_RATIOS, MAX_MATERIALS_PER_SHEET, RESOLUTIONS } from "@/lib/image-options";
import { validateSheetComposition } from "@/lib/sheets/validate";

export type EditorMaterial = {
  id: string;
  code: string;
  name: string;
  groupName: string;
  isActive: boolean;
  imageUrl: string | null;
  /** các trang mẫu khác đã chứa chất liệu này (để cảnh báo trùng) */
  otherSheets: string[];
};

export type SheetEditorInitial = {
  id: string | null;
  name: string;
  groupName: string;
  cols: number;
  rows: number;
  aspectRatio: string;
  resolution: string;
  isActive: boolean;
  materialIds: string[];
};

export function SheetEditor({
  initial,
  materials,
  groups,
}: {
  initial: SheetEditorInitial;
  materials: EditorMaterial[];
  groups: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initial.name);
  const [groupName, setGroupName] = useState(initial.groupName);
  const [cols, setCols] = useState(initial.cols);
  const [rows, setRows] = useState(initial.rows);
  const [aspectRatio, setAspectRatio] = useState(initial.aspectRatio);
  const [resolution, setResolution] = useState(initial.resolution);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [ids, setIds] = useState<string[]>(initial.materialIds);
  const [filterGroup, setFilterGroup] = useState("");
  const [search, setSearch] = useState("");

  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const problem = validateSheetComposition({ cols, rows, materialCount: ids.length });
  const full = ids.length >= MAX_MATERIALS_PER_SHEET;

  const candidates = materials.filter(
    (m) =>
      !ids.includes(m.id) &&
      (m.isActive || false) &&
      (!filterGroup || m.groupName === filterGroup) &&
      (!search || `${m.code} ${m.name}`.toLowerCase().includes(search.toLowerCase())),
  );

  function move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    setIds(next);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await saveSheetAction(initial.id, {
        name,
        groupName,
        cols,
        rows,
        aspectRatio: aspectRatio as (typeof ASPECT_RATIOS)[number],
        resolution: resolution as (typeof RESOLUTIONS)[number],
        isActive,
        materialIds: ids,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      toast.success("Đã lưu trang mẫu.");
      router.push("/admin/sheets");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <Label htmlFor="sheet-name">Tên trang mẫu</Label>
          <Input id="sheet-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sheet-group">Nhóm</Label>
          <Input
            id="sheet-group"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            list="sheet-group-options"
            maxLength={100}
            className="h-10"
          />
          <datalist id="sheet-group-options">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sheet-cols">Số cột</Label>
          <Input
            id="sheet-cols"
            type="number"
            min={1}
            max={5}
            value={cols}
            onChange={(e) => setCols(Number(e.target.value))}
            className="h-10"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sheet-rows">Số hàng</Label>
          <Input
            id="sheet-rows"
            type="number"
            min={1}
            max={10}
            value={rows}
            onChange={(e) => setRows(Number(e.target.value))}
            className="h-10"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sheet-aspect">Tỉ lệ ảnh</Label>
          <NativeSelect id="sheet-aspect" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
            {ASPECT_RATIOS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sheet-res">Độ phân giải</Label>
          <NativeSelect id="sheet-res" value={resolution} onChange={(e) => setResolution(e.target.value)}>
            {RESOLUTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </NativeSelect>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4" />
          Đang bật
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Chất liệu trong trang */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Chất liệu trong trang ({ids.length}/{MAX_MATERIALS_PER_SHEET})
            </h2>
            <span className="text-sm text-muted-foreground">
              {cols * rows} ô ({cols} x {rows})
            </span>
          </div>
          {problem && (
            <Alert variant="destructive">
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          )}
          {ids.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Chưa có chất liệu. Chọn từ danh sách bên phải.
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {ids.map((id, i) => {
                const m = byId.get(id);
                return (
                  <li key={id} className="flex items-center gap-2 rounded-lg border p-2">
                    <span className="w-6 shrink-0 text-center text-sm font-semibold">{i + 1}</span>
                    {m?.imageUrl ? (
                      <img src={m.imageUrl} alt="" className="h-10 w-16 shrink-0 rounded border object-contain" />
                    ) : (
                      <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded border text-[10px] text-muted-foreground">
                        Thiếu ảnh
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {m?.code} - {m?.name}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {m && !m.isActive && <Badge variant="secondary">Đang tắt</Badge>}
                        {m && !m.imageUrl && <Badge variant="secondary">Thiếu ảnh tham chiếu</Badge>}
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="icon" aria-label="Đưa lên" onClick={() => move(i, -1)} disabled={i === 0}>
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Đưa xuống"
                      onClick={() => move(i, 1)}
                      disabled={i === ids.length - 1}
                    >
                      <ArrowDownIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Bỏ khỏi trang"
                      onClick={() => setIds(ids.filter((x) => x !== id))}
                    >
                      <XIcon />
                    </Button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* Danh sách chọn */}
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Thêm chất liệu</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Tìm theo mã hoặc tên"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10"
              aria-label="Tìm chất liệu"
            />
            <NativeSelect value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)} aria-label="Lọc nhóm">
              <option value="">Mọi nhóm</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </NativeSelect>
          </div>
          {full && <p className="text-sm text-amber-700">Đã đủ {MAX_MATERIALS_PER_SHEET} chất liệu, không thêm được nữa.</p>}
          <ul className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1">
            {candidates.length === 0 && (
              <li className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Không còn chất liệu nào khớp.
              </li>
            )}
            {candidates.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-lg border p-2">
                {m.imageUrl ? (
                  <img src={m.imageUrl} alt="" className="h-10 w-16 shrink-0 rounded border object-contain" />
                ) : (
                  <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded border text-[10px] text-muted-foreground">
                    Thiếu ảnh
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.code} - {m.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.groupName}
                    {m.otherSheets.length > 0 && ` · đã có trong: ${m.otherSheets.join(", ")}`}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={full} onClick={() => setIds([...ids, m.id])}>
                  <PlusIcon /> Thêm
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="flex gap-2">
        <Button type="button" className="h-10 px-5" onClick={save} disabled={pending || !!problem || !name.trim()}>
          {pending && <Loader2Icon className="animate-spin" />}
          {pending ? "Đang lưu..." : "Lưu trang mẫu"}
        </Button>
        <Button type="button" variant="outline" className="h-10" onClick={() => router.back()} disabled={pending}>
          Hủy
        </Button>
      </div>
    </div>
  );
}
