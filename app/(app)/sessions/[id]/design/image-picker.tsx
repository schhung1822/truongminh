"use client";

import { useMemo, useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { CellSelectImage } from "@/components/cell-select-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { MAX_DESIGN_MATERIALS } from "@/lib/design/assign";
import { cn } from "@/lib/utils";

/** Một ô (chất liệu) trong ảnh catalog. `number` là số thứ tự ô trong ảnh (1, 2, 3...). */
export type CatalogCell = {
  number: number;
  materialId: string;
  code: string;
  name: string;
  groupName: string;
  printTech: string;
  /** mã công nghệ (MaterialOption loại TECHNIQUE), dùng để picker ảnh phong cách tự gợi ý đúng board */
  technique?: string | null;
  /** false: chất liệu đã bị xóa hoặc chưa có ảnh tham chiếu nên không thiết kế được */
  usable: boolean;
};

export type CatalogImage = {
  id: string;
  /** "Ảnh 1", "Ảnh 2"... */
  label: string;
  url: string;
  aspectRatio: string;
  cols: number;
  rows: number;
  cells: CatalogCell[];
};

/**
 * Chọn chất liệu ngay trên ảnh catalog: bấm vào một ảnh để xem lớn, rồi bấm vào số (ô) của chất liệu khách ưng ý,
 * chọn được một hoặc nhiều số, ở nhiều ảnh khác nhau. Chất liệu đã chọn hiện thành danh sách bên dưới.
 */
export function ImagePicker({
  images,
  selected,
  onChange,
}: {
  images: CatalogImage[];
  /** id các chất liệu đã chọn theo thứ tự chọn */
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = images.find((i) => i.id === openId) ?? null;

  // chất liệu đã chọn -> nơi xuất hiện đầu tiên (ảnh nào, số mấy), để hiện danh sách tóm tắt
  const where = useMemo(() => {
    const map = new Map<string, { cell: CatalogCell; image: CatalogImage }>();
    for (const image of images) for (const cell of image.cells) if (!map.has(cell.materialId)) map.set(cell.materialId, { cell, image });
    return map;
  }, [images]);

  function toggle(cell: CatalogCell) {
    if (!cell.usable) return;
    if (selected.includes(cell.materialId)) return onChange(selected.filter((id) => id !== cell.materialId));
    if (selected.length >= MAX_DESIGN_MATERIALS) return void toast.error(`Một lần thiết kế tối đa ${MAX_DESIGN_MATERIALS} chất liệu.`);
    onChange([...selected, cell.materialId]);
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((img) => {
          const count = img.cells.filter((c) => selected.includes(c.materialId)).length;
          return (
            <li key={img.id}>
              <button
                type="button"
                onClick={() => {
                  setOpenId(img.id);
                }}
                className={cn(
                  "group relative block w-full overflow-hidden rounded-xl border bg-card text-left transition-all hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  count > 0 && "border-primary ring-2 ring-primary",
                )}
                aria-label={`Mở ${img.label} để chọn chất liệu`}
              >
                <img src={img.url} alt={img.label} className="w-full bg-white" loading="lazy" />
                <span className="flex items-center justify-between gap-2 border-t px-3 py-2 text-sm">
                  <span className="font-medium">{img.label}</span>
                  <span className={cn("text-xs", count > 0 ? "font-semibold text-primary" : "text-muted-foreground")}>
                    {count > 0 ? `Đã chọn ${count} chất liệu` : "Bấm để chọn"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* chất liệu đã chọn */}
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            Đã chọn {selected.length}/{MAX_DESIGN_MATERIALS} chất liệu
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])} disabled={selected.length === 0}>
            Bỏ chọn hết
          </Button>
        </div>
        {selected.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bấm vào một ảnh ở trên, rồi bấm vào số của chất liệu khách ưng ý.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {selected.map((id) => {
              const w = where.get(id);
              if (!w) return null;
              return (
                <li key={id} className="flex items-center gap-1.5 rounded-full border bg-card py-1 pr-1 pl-2 text-sm">
                  <span className="rounded bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                    {w.image.label.replace("Ảnh ", "")}·{w.cell.number}
                  </span>
                  <span className="max-w-56 truncate">
                    {w.cell.code} - {w.cell.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange(selected.filter((x) => x !== id))}
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                    aria-label={`Bỏ ${w.cell.code}`}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-5xl">
          <DialogTitle>{open?.label}: bấm vào số để chọn chất liệu</DialogTitle>
          <DialogDescription>
            Chọn một hoặc nhiều số. Bấm lại để bỏ chọn. Đã chọn {selected.length}/{MAX_DESIGN_MATERIALS} chất liệu.
          </DialogDescription>

          {open && (
            <>
              <CellSelectImage
                key={open.id}
                url={open.url}
                alt={open.label}
                aspectRatio={open.aspectRatio}
                cols={open.cols}
                rows={open.rows}
                cells={open.cells}
                selected={selected}
                onToggle={toggle}
              />

              {/* cùng danh sách dạng chữ, để biết số nào là chất liệu nào */}
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {open.cells.map((cell) => {
                  const on = selected.includes(cell.materialId);
                  return (
                    <li key={cell.number}>
                      <button
                        type="button"
                        onClick={() => toggle(cell)}
                        disabled={!cell.usable}
                        aria-pressed={on}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50",
                          on && "border-primary bg-primary/5",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                            on ? "bg-primary text-primary-foreground" : "bg-muted",
                          )}
                        >
                          {on ? <CheckIcon className="size-4" /> : cell.number}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {cell.code} - {cell.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {cell.groupName} · {cell.printTech}
                            {!cell.usable && " · không thiết kế được"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-wrap gap-2">
                <Button type="button" className="h-10 px-5" onClick={() => setOpenId(null)}>
                  Xong ({selected.length} đã chọn)
                </Button>
                {(() => {
                  const idx = images.findIndex((i) => i.id === open.id);
                  const next = images[idx + 1];
                  return next ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      onClick={() => {
                        setOpenId(next.id);
                      }}
                    >
                      Sang {next.label}
                    </Button>
                  ) : null;
                })()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
