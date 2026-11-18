import { pickLabelIndexes } from "@/lib/stats/aggregate";
import { cn } from "@/lib/utils";

export type BarSegment = { value: number; className: string };
export type Bar = {
  /** nhãn trục ngang, ví dụ "18/11" */
  label: string;
  segments: BarSegment[];
  /** chú thích khi rê chuột */
  title: string;
};

/**
 * Biểu đồ cột (xếp chồng nếu có nhiều đoạn) vẽ bằng HTML/CSS thuần, không cần thư viện biểu đồ và không cần JavaScript ở trình duyệt.
 * Chiều cao cột tính theo tổng lớn nhất; trục dọc ghi mức lớn nhất, nửa mức và 0.
 */
export function DailyBars({
  bars,
  format,
  className,
}: {
  bars: Bar[];
  /** định dạng số ở trục dọc */
  format: (n: number) => string;
  className?: string;
}) {
  const totals = bars.map((b) => b.segments.reduce((s, x) => s + x.value, 0));
  const max = Math.max(1, ...totals);
  const labelIdx = new Set(pickLabelIndexes(bars.length, 8));
  const thin = bars.length > 45;

  return (
    <div className={cn("flex gap-2", className)} role="img" aria-label="Biểu đồ cột theo ngày">
      <div className="flex h-44 w-10 shrink-0 flex-col justify-between text-right text-[10px] text-muted-foreground tabular-nums">
        <span>{format(max)}</span>
        <span>{format(max / 2)}</span>
        <span>0</span>
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "relative flex h-44 items-end border-b border-l bg-[linear-gradient(to_bottom,transparent_calc(50%-0.5px),var(--border)_50%,transparent_calc(50%+0.5px))]",
            thin ? "gap-px" : "gap-1",
          )}
        >
          {bars.map((b, i) => (
            <div key={i} title={b.title} className="group relative flex h-full min-w-px flex-1 flex-col justify-end hover:bg-muted/60">
              {b.segments.map((s, j) =>
                s.value > 0 ? (
                  <div key={j} className={cn("w-full", s.className)} style={{ height: `${(s.value / max) * 100}%` }} />
                ) : null,
              )}
            </div>
          ))}
        </div>
        <div className="relative mt-1 h-4 text-[10px] text-muted-foreground">
          {bars.map((b, i) =>
            labelIdx.has(i) ? (
              <span
                key={i}
                className="absolute -translate-x-1/2 whitespace-nowrap tabular-nums"
                style={{ left: `${((i + 0.5) / bars.length) * 100}%` }}
              >
                {b.label}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
