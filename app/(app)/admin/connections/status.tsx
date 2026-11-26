import { cn } from "@/lib/utils";

/** Mức trạng thái của một kết nối: ok = đang chạy, warn = chạy nhưng cần xem, error = hỏng, off = chưa kết nối / đang tắt. */
export type Tone = "ok" | "warn" | "error" | "off";

const TONE: Record<Tone, { pill: string; dot: string }> = {
  ok: { pill: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200", dot: "bg-emerald-500" },
  warn: { pill: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200", dot: "bg-amber-500" },
  error: { pill: "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200", dot: "bg-red-500" },
  off: { pill: "border-border bg-muted text-muted-foreground", dot: "bg-muted-foreground/50" },
};

/** Nhãn trạng thái có chấm màu, dùng chung cho mọi mục trong khu Kết nối. */
export function StatusPill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  const t = TONE[tone];
  return (
    <span className={cn("inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", t.pill, className)}>
      <span className={cn("size-1.5 rounded-full", t.dot)} aria-hidden />
      {children}
    </span>
  );
}

/** Một dòng "nhãn: giá trị" trong thẻ thông tin kết nối. */
export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 text-sm text-muted-foreground sm:w-44">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm break-words">{children}</dd>
    </div>
  );
}
