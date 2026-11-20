import { Badge } from "@/components/ui/badge";
import { isVisibility, VISIBILITY_LABEL } from "@/lib/knowledge/roles";
import { STATUS_LABEL, type ArticleStatus } from "./article-schema";
import { cn } from "@/lib/utils";

const VISIBILITY_CLASS = {
  PUBLIC: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  INTERNAL: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  ADMIN_ONLY: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
} as const;

/** Nhãn màu mức hiển thị: công khai xanh lá, nội bộ vàng cam, chỉ admin đỏ. Dùng được cả ở server lẫn client. */
export function VisibilityBadge({ visibility, className }: { visibility: string; className?: string }) {
  if (!isVisibility(visibility)) return <Badge variant="secondary">{visibility}</Badge>;
  return <Badge className={cn("border-transparent", VISIBILITY_CLASS[visibility], className)}>{VISIBILITY_LABEL[visibility]}</Badge>;
}

const STATUS_CLASS: Record<ArticleStatus, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  ACTIVE: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  RETIRED: "bg-zinc-200 text-zinc-500 line-through dark:bg-zinc-800 dark:text-zinc-500",
};

export function StatusBadge({ status }: { status: string }) {
  const s = status as ArticleStatus;
  if (!(s in STATUS_LABEL)) return <Badge variant="secondary">{status}</Badge>;
  return <Badge className={cn("border-transparent", STATUS_CLASS[s])}>{STATUS_LABEL[s]}</Badge>;
}
