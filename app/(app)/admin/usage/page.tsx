import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangleIcon, CoinsIcon, DownloadIcon, ImageIcon, LayersIcon, UsersIcon } from "lucide-react";
import { DailyBars, type Bar } from "@/components/stats/daily-bars";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { todayKey } from "@/lib/jobs/limits";
import { getSettings } from "@/lib/settings";
import { buildDaily, buildPerUser, buildTotals, successRate, tokensPerImage } from "@/lib/stats/aggregate";
import { parseRange } from "@/lib/stats/range";
import {
  loadRecentFailures,
  loadSessionCount,
  loadTodayByUser,
  loadTopCustomers,
  loadTopMaterials,
  loadTopStyles,
  loadUsageRows,
  rangeBounds,
  type RankItem,
} from "@/lib/stats/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Thống kê" };

type Params = { preset?: string; from?: string; to?: string };

const nf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const PRESETS: { key: "7" | "30" | "90" | "month"; label: string }[] = [
  { key: "7", label: "7 ngày" },
  { key: "30", label: "30 ngày" },
  { key: "90", label: "90 ngày" },
  { key: "month", label: "Tháng này" },
];

const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const dmy = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

export default async function UsagePage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const tz = getEnv().APP_TIMEZONE;
  const today = todayKey();
  const range = parseRange(params, today);
  const { start, end } = rangeBounds(range.from, range.to, tz);

  const [rows, users, settings, sessions, topCustomers, topMaterials, topStyles, failures, todayByUser] = await Promise.all([
    loadUsageRows(range.from, range.to),
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, role: true, isActive: true } }),
    getSettings(),
    loadSessionCount(start, end),
    loadTopCustomers(start, end),
    loadTopMaterials(start, end),
    loadTopStyles(start, end),
    loadRecentFailures(start, end),
    loadTodayByUser(today),
  ]);

  const totals = buildTotals(rows);
  const daily = buildDaily(rows, range.days);
  const perUser = buildPerUser(rows);
  const rate = successRate(totals.ok, totals.failed);
  const perImage = tokensPerImage(totals.tokens, totals.ok);
  const hasTokens = totals.tokens > 0;
  const fmtTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: tz });

  const userRows = users
    .map((u) => ({ u, t: perUser.get(u.id) }))
    .filter(({ u, t }) => t || u.isActive)
    .sort((a, b) => (b.t?.count ?? 0) - (a.t?.count ?? 0) || a.u.name.localeCompare(b.u.name, "vi"));
  const maxUser = Math.max(1, ...userRows.map(({ t }) => t?.count ?? 0));

  const countBars: Bar[] = daily.map((d) => ({
    label: dm(d.day),
    segments: [
      { value: d.sheet, className: "bg-primary" },
      { value: d.design, className: "bg-amber-400" },
    ],
    title: `${dmy(d.day)}: ${d.total} lượt (catalog ${d.sheet}, thiết kế ${d.design})`,
  }));
  const tokenBars: Bar[] = daily.map((d) => ({
    label: dm(d.day),
    segments: [{ value: d.tokens, className: "bg-emerald-500" }],
    title: `${dmy(d.day)}: ${nf.format(d.tokens)} token`,
  }));

  const hrefFor = (p: Params) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v) sp.set(k, v);
    return `/admin/usage?${sp.toString()}`;
  };
  const exportHref = `/api/admin/usage/export?from=${range.from}&to=${range.to}`;

  const kpis = [
    {
      label: "Lượt tạo ảnh",
      value: nf.format(totals.count),
      sub: `Catalog ${nf.format(totals.sheet)} · Thiết kế ${nf.format(totals.design)}`,
      icon: <ImageIcon />,
    },
    {
      label: "Ảnh đã xong",
      value: nf.format(totals.ok),
      sub: rate === null ? "Chưa có ảnh nào xong" : `Tỉ lệ thành công ${nf.format(rate)}%`,
      icon: <LayersIcon />,
    },
    {
      label: "Ảnh lỗi",
      value: nf.format(totals.failed),
      sub: totals.failed > 0 ? "Xem chi tiết ở cuối trang" : "Không có lỗi",
      icon: <AlertTriangleIcon />,
      tone: totals.failed > 0 ? "text-red-600" : undefined,
    },
    {
      label: "Token đã dùng",
      value: nf.format(totals.tokens),
      sub: hasTokens ? `Trung bình ${perImage === null ? "—" : nf.format(perImage)} token/ảnh xong` : "Chỉ tính ảnh tạo bằng kie.ai",
      icon: <CoinsIcon />,
    },
    {
      label: "Phiên tư vấn",
      value: nf.format(sessions.catalog),
      sub: `${nf.format(sessions.design)} lượt thiết kế (bước 2)`,
      icon: <LayersIcon />,
    },
    {
      label: "Người đã tạo ảnh",
      value: nf.format(totals.activeUsers),
      sub: `trên ${users.filter((u) => u.isActive).length} tài khoản đang hoạt động`,
      icon: <UsersIcon />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Thống kê</h1>
          <p className="text-muted-foreground">
            Từ {dmy(range.from)} đến {dmy(range.to)} ({range.days.length} ngày). Mỗi ảnh tạo hoặc tạo lại tính một lượt; lần tự thử lại
            khi lỗi không tính.
          </p>
        </div>
        <a href={exportHref} className={buttonVariants({ variant: "outline", className: "h-10" })}>
          <DownloadIcon /> Tải CSV
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
          <button type="submit" className={buttonVariants({ variant: "secondary", className: "h-9" })}>
            Xem
          </button>
        </form>
      </div>

      {/* Số liệu chính */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <li key={k.label}>
            <Card className="h-full py-3">
              <CardContent className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
                  {k.icon} {k.label}
                </span>
                <span className={cn("text-2xl font-semibold tabular-nums", k.tone)}>{k.value}</span>
                <span className="text-xs text-muted-foreground">{k.sub}</span>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {/* Biểu đồ theo ngày */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lượt tạo ảnh theo ngày</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-primary" /> Catalog
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-amber-400" /> Thiết kế
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DailyBars bars={countBars} format={(n) => nf.format(Math.round(n))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Token theo ngày</CardTitle>
            <CardDescription>Số token kie.ai đã trừ cho các ảnh tạo trong ngày.</CardDescription>
          </CardHeader>
          <CardContent>
            {hasTokens ? (
              <DailyBars bars={tokenBars} format={(n) => nf.format(Math.round(n))} />
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">Chưa có token nào được ghi nhận trong khoảng này.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Theo từng người */}
      <Card>
        <CardHeader>
          <CardTitle>Theo từng người dùng</CardTitle>
          <CardDescription>
            Hạn mức: {nf.format(settings.dailyLimitPerSale)} lượt mỗi sale mỗi ngày (admin không bị giới hạn). Đổi ở Quản trị &gt; Cấu hình.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Người dùng</TableHead>
                <TableHead className="min-w-44">Lượt trong khoảng</TableHead>
                <TableHead className="text-right">Catalog</TableHead>
                <TableHead className="text-right">Thiết kế</TableHead>
                <TableHead className="text-right">Xong / Lỗi</TableHead>
                <TableHead className="text-right">Token</TableHead>
                <TableHead className="text-right">Ngày hoạt động</TableHead>
                <TableHead className="text-right">Hôm nay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userRows.map(({ u, t }) => {
                const usedToday = todayByUser.get(u.id) ?? 0;
                const near = u.role !== "ADMIN" && settings.dailyLimitPerSale > 0 && usedToday >= settings.dailyLimitPerSale * 0.8;
                return (
                  <TableRow key={u.id} className={cn(!u.isActive && "opacity-60")}>
                    <TableCell>
                      <div className="font-medium">
                        {u.name}
                        {u.role === "ADMIN" && <Badge variant="secondary" className="ml-2">Admin</Badge>}
                        {!u.isActive && <Badge variant="outline" className="ml-2">Đã khóa</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="w-10 text-right font-semibold tabular-nums">{nf.format(t?.count ?? 0)}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${((t?.count ?? 0) / maxUser) * 100}%` }} />
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{nf.format(t?.sheet ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{nf.format(t?.design ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {nf.format(t?.ok ?? 0)} / <span className={cn((t?.failed ?? 0) > 0 && "text-red-600")}>{nf.format(t?.failed ?? 0)}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{nf.format(t?.tokens ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{t?.activeDays ?? 0}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", near && "font-semibold text-amber-700")}>
                      {u.role === "ADMIN" ? usedToday : `${usedToday}/${nf.format(settings.dailyLimitPerSale)}`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Bảng xếp hạng */}
      <div className="grid gap-4 lg:grid-cols-3">
        <RankCard title="Khách hàng có nhiều ảnh nhất" unit="ảnh" items={topCustomers} empty="Chưa có ảnh nào trong khoảng này." />
        <RankCard
          title="Chất liệu khách chọn nhiều nhất"
          description="Ở bước 2 (thiết kế)"
          unit="lần"
          items={topMaterials}
          empty="Chưa có lượt thiết kế nào."
        />
        <RankCard title="Kiểu thiết kế dùng nhiều nhất" unit="ảnh" items={topStyles} empty="Chưa có ảnh thiết kế nào." />
      </div>

      {/* Theo ngày dạng bảng */}
      <details className="group rounded-xl border bg-card">
        <summary className="cursor-pointer list-none p-4 font-medium select-none [&::-webkit-details-marker]:hidden">
          Bảng số liệu theo ngày <span className="text-sm font-normal text-muted-foreground">(bấm để mở)</span>
        </summary>
        <div className="overflow-x-auto border-t p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead className="text-right">Lượt</TableHead>
                <TableHead className="text-right">Catalog</TableHead>
                <TableHead className="text-right">Thiết kế</TableHead>
                <TableHead className="text-right">Token</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...daily].reverse().map((d) => (
                <TableRow key={d.day} className={cn(d.total === 0 && "text-muted-foreground")}>
                  <TableCell>{dmy(d.day)}</TableCell>
                  <TableCell className="text-right tabular-nums">{nf.format(d.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{nf.format(d.sheet)}</TableCell>
                  <TableCell className="text-right tabular-nums">{nf.format(d.design)}</TableCell>
                  <TableCell className="text-right tabular-nums">{nf.format(d.tokens)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>

      {/* Ảnh lỗi gần đây */}
      <Card>
        <CardHeader>
          <CardTitle>Ảnh lỗi gần đây</CardTitle>
          <CardDescription>10 ảnh lỗi mới nhất trong khoảng đã chọn, để biết nguyên nhân (hết token, sai khóa, nội dung bị từ chối...).</CardDescription>
        </CardHeader>
        <CardContent>
          {failures.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có ảnh nào bị lỗi trong khoảng này.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {failures.map((f) => (
                <li key={f.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2.5 text-sm">
                  <span className="w-32 shrink-0 text-muted-foreground tabular-nums">{fmtTime.format(f.at)}</span>
                  <span className="w-40 shrink-0 font-medium">{f.brand}</span>
                  <span className="w-32 shrink-0 text-muted-foreground">{f.userName}</span>
                  <span className="min-w-0 flex-1 break-words text-red-700">{f.message ?? "Không có thông báo lỗi"}</span>
                  <Link href={`/sessions/${f.sessionId}`} className="shrink-0 underline">
                    Mở phiên
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RankCard({
  title,
  description,
  unit,
  items,
  empty,
}: {
  title: string;
  description?: string;
  unit: string;
  items: RankItem[];
  empty: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ol className="flex flex-col gap-2.5">
            {items.map((it, i) => (
              <li key={it.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="mr-1.5 text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
                    <span className="font-medium">{it.label}</span>
                    {it.sub && <span className="ml-1.5 text-xs text-muted-foreground">{it.sub}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {nf.format(it.value)} <span className="text-xs text-muted-foreground">{unit}</span>
                  </span>
                </div>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(it.value / max) * 100}%` }} />
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
