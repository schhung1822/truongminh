import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { QUOTE_STATUS_LABEL, isQuoteStatus } from "./format";

/** Nhãn trạng thái báo giá: Nháp / Đã gửi khách / Khách chốt. Dùng được cả ở trang máy chủ lẫn trình duyệt. */
export function QuoteStatusBadge({ status, className }: { status: string; className?: string }) {
  const known = isQuoteStatus(status);
  return (
    <Badge
      variant={known && status === "DRAFT" ? "secondary" : "outline"}
      className={cn(
        known && status === "SENT" && "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
        known && status === "WON" && "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
        className,
      )}
    >
      {known ? QUOTE_STATUS_LABEL[status] : status}
    </Badge>
  );
}
