import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/dal";
import { listChangeLogs } from "@/lib/quoting/store";
import { cn } from "@/lib/utils";
import { loadTechniqueLabels } from "../data";
import { formatDateTime } from "../format";
import { ENTITY_FILTERS, ENTITY_LABEL, formatChangeLog } from "../history-format";

export const metadata: Metadata = { title: "Lịch sử thay đổi thông số" };

const STEP = 50;
const MAX = 500;

type Params = { entity?: string; limit?: string };

function href(entity: string, limit: number): string {
  const sp = new URLSearchParams();
  if (entity) sp.set("entity", entity);
  if (limit > STEP) sp.set("limit", String(limit));
  const s = sp.toString();
  return `/admin/quoting/history${s ? `?${s}` : ""}`;
}

export default async function QuotingHistoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const entity = (ENTITY_FILTERS as readonly string[]).includes(params.entity ?? "") ? (params.entity as string) : "";
  const limit = Math.min(MAX, Math.max(STEP, Math.round((Number(params.limit) || STEP) / STEP) * STEP));

  const [fetched, techLabels] = await Promise.all([listChangeLogs({ entity: entity || undefined, limit: limit + 1 }), loadTechniqueLabels()]);
  const hasMore = fetched.length > limit && limit < MAX;
  const rows = fetched.slice(0, limit);

  const filters = [{ value: "", label: "Tất cả" }, ...ENTITY_FILTERS.map((e) => ({ value: e, label: ENTITY_LABEL[e] }))];

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Mỗi lần sửa tấm vật liệu, thông số máy hoặc cấu hình giá đều được ghi lại: ai sửa, lúc nào, giá trị cũ và mới. Kích thước tấm hiện bằng cm, lề và khoảng cách bằng mm, tiền bằng đồng.
      </p>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo loại">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={href(f.value, STEP)}
            aria-current={f.value === entity ? "page" : undefined}
            className={cn("rounded-full border px-3.5 py-1.5 text-sm transition-colors", f.value === entity ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed py-14 text-center text-muted-foreground">Chưa có thay đổi nào được ghi lại.</div>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Thời gian</TableHead>
                  <TableHead>Người sửa</TableHead>
                  <TableHead>Đối tượng</TableHead>
                  <TableHead className="pr-4">Thay đổi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const changes = formatChangeLog(r.entity, r.before, r.after);
                  const label = r.entity === "MACHINE_PROFILE" ? `Máy: ${techLabels.get(r.entityId) ?? r.entityId}` : r.entityLabel;
                  return (
                    <TableRow key={r.id} className="align-top">
                      <TableCell className="py-2 pl-4 text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</TableCell>
                      <TableCell className="py-2">{r.userName}</TableCell>
                      <TableCell className="max-w-64 py-2 whitespace-normal">
                        <Badge variant="outline">{ENTITY_LABEL[r.entity] ?? r.entity}</Badge>
                        <div className="mt-1 text-sm">{label}</div>
                      </TableCell>
                      <TableCell className="py-2 pr-4 whitespace-normal">
                        {changes.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Không đọc được chi tiết.</span>
                        ) : (
                          <ul className="flex flex-col gap-1 text-sm">
                            {changes.map((c) => (
                              <li key={c.field} className="flex flex-wrap items-baseline gap-x-1.5">
                                <span className="font-medium">{c.label}:</span>
                                {c.before === "" ? (
                                  <span>{c.after}</span>
                                ) : (
                                  <>
                                    <span className="text-muted-foreground">{c.before}</span>
                                    <ArrowRightIcon className="size-3.5 self-center text-muted-foreground" aria-label="đổi thành" />
                                    <span>{c.after}</span>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-center gap-3">
        <span className="text-sm text-muted-foreground">
          Hiển thị {rows.length} thay đổi gần nhất{limit >= MAX && !hasMore ? ` (tối đa ${MAX})` : ""}
        </span>
        {hasMore && (
          <Link href={href(entity, limit + STEP)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Xem thêm {STEP} thay đổi
          </Link>
        )}
      </div>
    </div>
  );
}
