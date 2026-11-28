import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, DownloadIcon, TargetIcon, TrendingUpIcon, UserXIcon, UsersRoundIcon } from "lucide-react";
import { DailyBars, type Bar } from "@/components/stats/daily-bars";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireFbManager } from "@/lib/fb/access";
import { loadLeadStats, loadSupplierFunnel, SUPPLIER_FUNNEL_STEPS, type LeadFunnel } from "@/lib/fb/lead-stats";
import { getEnv } from "@/lib/env";
import { parseRange } from "@/lib/stats/range";
import { rangeBounds } from "@/lib/stats/queries";
import { todayKey } from "@/lib/jobs/limits";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "../lead-status";

export const metadata: Metadata = { title: "Thống kê Lead" };

type Params = { preset?: string; from?: string; to?: string };

const nf = new Intl.NumberFormat("vi-VN");
const PRESETS: { key: "7" | "30" | "90" | "month"; label: string }[] = [
  { key: "7", label: "7 ngày" },
  { key: "30", label: "30 ngày" },
  { key: "90", label: "90 ngày" },
  { key: "month", label: "Tháng này" },
];
const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const dmy = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
const pct = (n: number, total: number) => (total === 0 ? "—" : `${((n / total) * 100).toFixed(1).replace(/\.0$/, "")}%`);

function funnelCount(f: LeadFunnel, keys: (keyof LeadFunnel)[]) {
  return keys.reduce((s, k) => s + f[k], 0);
}

export default async function LeadStatsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireFbManager();
  const params = await searchParams;
  const tz = getEnv().APP_TIMEZONE;
  const today = todayKey();
  const range = parseRange(params, today);
  const { start, end } = rangeBounds(range.from, range.to, tz);
  const [stats, supplier] = await Promise.all([loadLeadStats(start, end, range.days, tz), loadSupplierFunnel(start, end)]);

  const won = stats.funnel.WON;
  const lostInvalid = funnelCount(stats.funnel, ["LOST", "INVALID"]);
  const inProgress = funnelCount(stats.funnel, ["NEW", "CONTACTED", "QUALIFIED"]);

  const bars: Bar[] = stats.byDay.map((d) => ({
    label: dm(d.day),
    segments: [{ value: d.count, className: "bg-primary" }],
    title: `${dmy(d.day)}: ${d.count} lead`,
  }));

  const hrefFor = (p: Params) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v) sp.set(k, v);
    return `/fb/leads/stats?${sp.toString()}`;
  };
  const exportHref = `/api/fb/leads/stats-export?from=${range.from}&to=${range.to}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Thống kê Lead</h1>
          <p className="text-muted-foreground">
            Từ {dmy(range.from)} đến {dmy(range.to)} ({range.days.length} ngày). Tính theo lúc lead được tạo (khách để lại liên hệ).
          </p>
        </div>
        <a href={exportHref} className="flex h-10 items-center gap-2 rounded-lg border px-4 text-sm hover:bg-muted">
          <DownloadIcon className="size-4" /> Tải CSV
        </a>
      </div>

      {/* Chọn khoảng thời gian */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Khoảng nhanh">
          {PRESETS.map((p) => (
            <Link
              key={p.key}
              href={hrefFor({ preset: p.key })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                range.preset === p.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form method="get" className="ml-auto flex flex-wrap items-center gap-2">
          <Input type="date" name="from" defaultValue={range.preset === "custom" ? range.from : ""} className="h-9 w-40" aria-label="Từ ngày" />
          <span className="text-sm text-muted-foreground">đến</span>
          <Input type="date" name="to" defaultValue={range.preset === "custom" ? range.to : ""} className="h-9 w-40" aria-label="Đến ngày" />
          <button type="submit" className="flex h-9 items-center rounded-lg bg-secondary px-3 text-sm hover:bg-secondary/80">
            Xem
          </button>
        </form>
      </div>

      {/* Số liệu chính */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <li>
          <Card className="h-full py-3">
            <CardContent className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TargetIcon className="size-3.5" /> Tổng lead
              </span>
              <span className="text-2xl font-semibold tabular-nums">{nf.format(stats.total)}</span>
              <span className="text-xs text-muted-foreground">Trong khoảng đã chọn</span>
            </CardContent>
          </Card>
        </li>
        <li>
          <Card className="h-full py-3">
            <CardContent className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUpIcon className="size-3.5" /> Đã chốt đơn
              </span>
              <span className="text-2xl font-semibold tabular-nums text-emerald-600">{nf.format(won)}</span>
              <span className="text-xs text-muted-foreground">{pct(won, stats.total)} trên tổng lead</span>
            </CardContent>
          </Card>
        </li>
        <li>
          <Card className="h-full py-3">
            <CardContent className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <UsersRoundIcon className="size-3.5" /> Đang xử lý
              </span>
              <span className="text-2xl font-semibold tabular-nums">{nf.format(inProgress)}</span>
              <span className="text-xs text-muted-foreground">Mới, đã liên hệ hoặc có nhu cầu</span>
            </CardContent>
          </Card>
        </li>
        <li>
          <Card className="h-full py-3">
            <CardContent className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserXIcon className="size-3.5" /> Mất / không hợp lệ
              </span>
              <span className="text-2xl font-semibold tabular-nums text-muted-foreground">{nf.format(lostInvalid)}</span>
              <span className="text-xs text-muted-foreground">{pct(lostInvalid, stats.total)} trên tổng lead</span>
            </CardContent>
          </Card>
        </li>
      </ul>

      {/* Phễu chuyển đổi */}
      <Card>
        <CardHeader>
          <CardTitle>Phễu chuyển đổi</CardTitle>
          <CardDescription>Từ lúc có lead đến khi chốt đơn. Lead &quot;Mất&quot; hoặc &quot;Không hợp lệ&quot; không tính vào phễu chính.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-stretch gap-2">
            {(["NEW", "CONTACTED", "QUALIFIED", "WON"] as const).map((status, i) => (
              <div key={status} className="flex items-center gap-2">
                <div className="flex min-w-32 flex-1 flex-col items-center gap-1 rounded-xl border bg-card p-3 text-center">
                  <span className="text-xs text-muted-foreground">{STATUS_LABEL[status]}</span>
                  <span className="text-xl font-semibold tabular-nums">{nf.format(stats.funnel[status])}</span>
                  <span className="text-xs text-muted-foreground">{pct(stats.funnel[status], stats.total)}</span>
                </div>
                {i < 3 && <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />}
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Mất: <b className="text-foreground">{nf.format(stats.funnel.LOST)}</b> · Không hợp lệ: <b className="text-foreground">{nf.format(stats.funnel.INVALID)}</b>
          </p>
        </CardContent>
      </Card>

      {/* Phễu của bài tìm nhà sản xuất (v1.1) */}
      <Card>
        <CardHeader>
          <CardTitle>Phễu bài tìm nhà sản xuất</CardTitle>
          <CardDescription>
            Từ comment trên bài tìm nhà sản xuất đến đơn vật liệu. Có {nf.format(supplier.leads)} lead nhà sản xuất trong khoảng này; các bước sau tính trên những lead đó, mỗi bước đếm riêng.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {supplier.comments === 0 && supplier.leads === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có comment nào trên bài tìm nhà sản xuất trong khoảng này.</p>
          ) : (
            <div className="flex flex-wrap items-stretch gap-2">
              {SUPPLIER_FUNNEL_STEPS.map((step, i) => (
                <div key={step.key} className="flex items-center gap-2">
                  <div className="flex min-w-32 flex-1 flex-col items-center gap-1 rounded-xl border bg-card p-3 text-center" title={step.hint}>
                    <span className="text-xs text-muted-foreground">{step.label}</span>
                    <span className="text-xl font-semibold tabular-nums">{nf.format(supplier[step.key])}</span>
                    <span className="text-xs text-muted-foreground">{step.key === "comments" ? "trên bài" : `${pct(supplier[step.key], supplier.leads)} lead`}</span>
                  </div>
                  {i < SUPPLIER_FUNNEL_STEPS.length - 1 && <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />}
                </div>
              ))}
            </div>
          )}
          <Link href="/fb/leads?view=supplier" className="mt-3 inline-block text-sm underline underline-offset-4">
            Xem danh sách nhà sản xuất
          </Link>
        </CardContent>
      </Card>

      {/* Biểu đồ theo ngày */}
      <Card>
        <CardHeader>
          <CardTitle>Lead theo ngày</CardTitle>
          <CardDescription>Số lead mới xuất hiện mỗi ngày (theo thời điểm tạo).</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.total > 0 ? <DailyBars bars={bars} format={(n) => nf.format(Math.round(n))} /> : <p className="py-12 text-center text-sm text-muted-foreground">Chưa có lead nào trong khoảng này.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Nhóm hiệu quả nhất */}
        <Card>
          <CardHeader>
            <CardTitle>Nhóm hiệu quả nhất</CardTitle>
            <CardDescription>Xếp theo số lead thu được trong khoảng đã chọn.</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.topGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có lead từ nhóm nào trong khoảng này.</p>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {stats.topGroups.map((it, i) => {
                  const max = Math.max(1, ...stats.topGroups.map((x) => x.value));
                  return (
                    <li key={it.id} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="mr-1.5 text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
                          <span className="font-medium">{it.label}</span>
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {nf.format(it.value)} <span className="text-xs text-muted-foreground">lead</span>
                        </span>
                      </div>
                      <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(it.value / max) * 100}%` }} />
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            <Link href="/fb/groups" className="mt-3 inline-block text-sm underline underline-offset-4">
              Xem tất cả nhóm
            </Link>
          </CardContent>
        </Card>

        {/* Theo từng sale */}
        <Card>
          <CardHeader>
            <CardTitle>Theo từng sale phụ trách</CardTitle>
            <CardDescription>Tính theo người đang được gán hiện tại, không phải lịch sử gán.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {stats.bySale.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có lead nào được gán cho ai trong khoảng này.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sale</TableHead>
                    <TableHead className="text-right">Tổng lead</TableHead>
                    <TableHead className="text-right">Đã chốt</TableHead>
                    <TableHead className="text-right">Tỷ lệ chốt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.bySale.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{nf.format(s.total)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700">{nf.format(s.won)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(s.won, s.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
