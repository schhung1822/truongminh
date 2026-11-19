"use client";

import { useState } from "react";
import { CheckIcon } from "lucide-react";
import { cellRegions } from "@/lib/imaging/geometry";
import { cn } from "@/lib/utils";

/** Một ô (chất liệu) trong ảnh catalog. `number` là số thứ tự ô trong ảnh (1, 2, 3...). */
export type SelectableCell = {
  number: number;
  materialId: string;
  code: string;
  name: string;
  /** false: chất liệu đã bị xóa hoặc chưa có ảnh tham chiếu nên không chọn được (mặc định true) */
  usable?: boolean;
};

/**
 * Ảnh catalog có phủ vùng bấm lên từng ô, mỗi ô có một số: bấm để chọn hoặc bỏ chọn chất liệu của ô đó.
 * Vùng bấm đặt theo hình học ảnh thành phẩm (xem lib/imaging/geometry.ts).
 * Đặt `key` theo ảnh ở nơi dùng để kích thước được đo lại khi đổi ảnh.
 */
export function CellSelectImage<T extends SelectableCell>({
  url,
  alt,
  aspectRatio,
  cols,
  rows,
  cells,
  selected,
  onToggle,
  showNumbers = true,
}: {
  url: string;
  alt: string;
  aspectRatio: string;
  cols: number;
  rows: number;
  cells: T[];
  /** id các chất liệu đang được chọn */
  selected: string[];
  onToggle: (cell: T) => void;
  /** false: ẩn số để xem ảnh rõ, vẫn bấm chọn được */
  showNumbers?: boolean;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const regions = size
    ? cellRegions({ finalWidth: size.w, finalHeight: size.h, aspectRatio, cols, rows, count: cells.length })
    : [];

  return (
    <div className="relative overflow-hidden rounded-lg border bg-white">
      <img
        src={url}
        alt={alt}
        className="block w-full"
        onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
      />
      {regions.map((r) => {
        const cell = cells[r.index];
        const usable = cell.usable !== false;
        const on = selected.includes(cell.materialId);
        return (
          <button
            key={r.index}
            type="button"
            onClick={() => onToggle(cell)}
            disabled={!usable}
            aria-pressed={on}
            aria-label={`Số ${cell.number}: ${cell.code} - ${cell.name}`}
            title={`${cell.number}. ${cell.code} - ${cell.name}`}
            style={{ left: `${r.left * 100}%`, top: `${r.top * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` }}
            className={cn(
              "absolute flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-primary",
              usable ? "hover:bg-primary/10" : "cursor-not-allowed bg-white/60",
              on && "bg-primary/20 ring-4 ring-primary ring-inset",
            )}
          >
            {(showNumbers || on) && (
              <span
                className={cn(
                  "flex size-[2.6rem] items-center justify-center rounded-full text-lg font-bold shadow-md",
                  on ? "bg-primary text-primary-foreground" : "bg-black/60 text-white",
                  !usable && "bg-muted-foreground/60",
                )}
              >
                {on ? <CheckIcon className="size-6" /> : cell.number}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
