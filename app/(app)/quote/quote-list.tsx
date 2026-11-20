"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { listLogoQuotesAction, type QuoteListItem } from "./actions";
import { fmtCm, fmtVnd } from "./format";
import { QuoteStatusBadge } from "./status-badge";

/** Các báo giá đã lưu của một logo (ai cũng xem được). `refreshKey` đổi thì tải lại, ví dụ sau khi lưu báo giá mới. */
export function QuoteList({ logoId, refreshKey }: { logoId: string; refreshKey: number }) {
  const [state, setState] = useState<{ key: string; items: QuoteListItem[] | null; error: string | null } | null>(null);
  const key = `${logoId}:${refreshKey}`;

  useEffect(() => {
    let cancelled = false;
    listLogoQuotesAction(logoId).then((r) => {
      if (cancelled) return;
      setState("error" in r ? { key, items: null, error: r.error } : { key, items: r.items, error: null });
    });
    return () => {
      cancelled = true;
    };
  }, [logoId, key]);

  const ready = state?.key === key ? state : null;

  if (!ready) return <Skeleton className="h-16 w-full" />;
  if (ready.error) return <p className="text-sm text-destructive">{ready.error}</p>;
  if (!ready.items || ready.items.length === 0) return <p className="text-sm text-muted-foreground">Logo này chưa có báo giá nào được lưu.</p>;

  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {ready.items.map((q) => (
        <li key={q.id}>
          <Link href={`/quote/${q.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-sm no-underline transition-colors hover:bg-muted/50">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{q.materialLabel}</span>
              <span className="block text-xs text-muted-foreground">
                Logo {fmtCm(q.logoWidthMm)} cm · {q.perSheet} logo/tấm
                {q.firstUnitPrice !== null ? ` · ${fmtVnd(q.firstUnitPrice)}/cái ở mốc đầu` : ""}
              </span>
            </span>
            <QuoteStatusBadge status={q.status} />
            <span className="text-xs text-muted-foreground">
              {q.createdByName} · {q.createdAtText}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
