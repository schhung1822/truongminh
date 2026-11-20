import { CircleCheckIcon, CircleXIcon, TriangleAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MACHINE_STATE_LABEL, type MachineState } from "./status";

const STATE_CLASS: Record<MachineState, string> = {
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  partial: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  missing: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  none: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

/** Nhãn tình trạng thông số máy của một công nghệ. */
export function MachineStateBadge({ state, className }: { state: MachineState; className?: string }) {
  return <Badge className={cn("h-5 font-medium", STATE_CLASS[state], className)}>{MACHINE_STATE_LABEL[state]}</Badge>;
}

export function StateIcon({ state, className }: { state: "ok" | "warn" | "missing"; className?: string }) {
  if (state === "ok") return <CircleCheckIcon className={cn("size-4 shrink-0 text-emerald-600", className)} aria-label="Đủ" />;
  if (state === "warn") return <TriangleAlertIcon className={cn("size-4 shrink-0 text-amber-600", className)} aria-label="Cần lưu ý" />;
  return <CircleXIcon className={cn("size-4 shrink-0 text-red-600", className)} aria-label="Còn thiếu" />;
}
