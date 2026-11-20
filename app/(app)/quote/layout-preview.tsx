import type { Placement } from "@/lib/nesting";
import { cn } from "@/lib/utils";
import { fmtCm } from "./format";
import type { QuoteLayoutStock } from "./layout-svg";

/** Quá số logo này thì không vẽ ảnh thật bên trong từng ô (nặng máy), chỉ vẽ khung chữ nhật. */
export const MAX_IMAGE_PLACEMENTS = 150;
/** Quá số logo này thì không ghi số thứ tự trong ô (chữ quá nhỏ, không đọc được). */
const MAX_NUMBERED = 80;

/**
 * Hình xem trước bố cục xếp logo trên tấm (SVG, đơn vị mm, gốc ở góc trên-trái của tấm).
 * Thuần trình bày: không trạng thái, không gọi máy chủ. Ô xanh = xếp thẳng, ô cam = xoay 90 độ.
 * Ảnh logo thật chỉ là hình minh họa gần đúng (ảnh có thể có viền trong suốt quanh phần nội dung).
 */
export function LayoutPreview({
  stock,
  placements,
  logoUrl,
  showImages = false,
  className,
}: {
  stock: QuoteLayoutStock | null;
  placements: Placement[];
  logoUrl?: string | null;
  showImages?: boolean;
  className?: string;
}) {
  if (!stock || !(stock.widthMm > 0) || !(stock.heightMm > 0)) {
    return (
      <p className={cn("rounded-lg border border-dashed p-4 text-sm text-muted-foreground", className)}>
        Báo giá này không lưu kích thước tấm nên không vẽ được hình xem trước.
      </p>
    );
  }

  const W = stock.widthMm;
  const H = stock.heightMm;
  const big = Math.max(W, H);
  const fs = big / 32; // cỡ chữ nhãn (mm của hệ tọa độ vẽ)
  const padL = fs * 2.3;
  const padT = fs * 2.3;
  const pad = fs * 0.6;
  const margin = Math.max(0, stock.edgeMarginMm);
  const items = placements.filter((p) => [p.x, p.y, p.width, p.height].every((v) => Number.isFinite(v)));
  const rotated = items.filter((p) => p.rotation === 90).length;
  const withImages = !!logoUrl && showImages && items.length <= MAX_IMAGE_PLACEMENTS;
  const numbered = !withImages && items.length <= MAX_NUMBERED;

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <svg
        viewBox={`${-padL} ${-padT} ${W + padL + pad} ${H + padT + pad}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Bố cục xếp ${items.length} logo trên tấm ${fmtCm(W)} x ${fmtCm(H)} cm`}
        className="mx-auto block h-auto max-h-[70vh] w-full rounded-lg border bg-card"
      >
        <text x={W / 2} y={-fs * 0.7} fontSize={fs} textAnchor="middle" className="fill-muted-foreground">
          {fmtCm(W)} cm
        </text>
        <text transform={`translate(${-fs * 0.7} ${H / 2}) rotate(-90)`} fontSize={fs} textAnchor="middle" className="fill-muted-foreground">
          {fmtCm(H)} cm
        </text>

        <rect x={0} y={0} width={W} height={H} className="fill-muted/40 stroke-foreground/70" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {margin > 0 && W - margin * 2 > 0 && H - margin * 2 > 0 && (
          <rect
            x={margin}
            y={margin}
            width={W - margin * 2}
            height={H - margin * 2}
            fill="none"
            className="stroke-muted-foreground"
            strokeWidth={1}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {items.map((p, i) => {
          const isRot = p.rotation === 90;
          const cx = p.x + p.width / 2;
          const cy = p.y + p.height / 2;
          const nfs = Math.max(1, Math.min(fs, Math.min(p.width, p.height) * 0.4));
          return (
            <g key={i}>
              <rect
                x={p.x}
                y={p.y}
                width={p.width}
                height={p.height}
                className={
                  isRot
                    ? "fill-orange-100 stroke-orange-500 dark:fill-orange-950 dark:stroke-orange-400"
                    : "fill-sky-100 stroke-sky-600 dark:fill-sky-950 dark:stroke-sky-400"
                }
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              {withImages &&
                (isRot ? (
                  // logo xoay 90 độ: vẽ ảnh theo kích thước chưa xoay (dài/ngắn đổi chỗ) rồi xoay quanh tâm ô
                  <image
                    href={logoUrl!}
                    x={cx - p.height / 2}
                    y={cy - p.width / 2}
                    width={p.height}
                    height={p.width}
                    preserveAspectRatio="xMidYMid meet"
                    transform={`rotate(90 ${cx} ${cy})`}
                  />
                ) : (
                  <image href={logoUrl!} x={p.x} y={p.y} width={p.width} height={p.height} preserveAspectRatio="xMidYMid meet" />
                ))}
              {numbered && (
                <text x={cx} y={cy + nfs * 0.35} fontSize={nfs} textAnchor="middle" className="fill-foreground/80">
                  {i + 1}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          Tấm {fmtCm(W)} x {fmtCm(H)} cm · {items.length} logo
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm border border-sky-600 bg-sky-100 dark:bg-sky-950" aria-hidden />
          Xếp thẳng ({items.length - rotated})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm border border-orange-500 bg-orange-100 dark:bg-orange-950" aria-hidden />
          Xoay 90° ({rotated})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t border-dashed border-muted-foreground" aria-hidden />
          Lề tấm {fmtCm(margin, true)} cm
        </span>
      </figcaption>
    </figure>
  );
}
