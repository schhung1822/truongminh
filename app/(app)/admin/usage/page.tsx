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
import { classifyFailure, failureCauseByKey, failuresByDay, FIX_LABEL, modelFailureRates, pageOf, summarizeFailures, type FailureFix } from "@/lib/stats/failure-causes";
import { parseRange } from "@/lib/stats/range";
import {
  FAILURE_SCAN_LIMIT,
  loadFailures,
  loadModelStatusCounts,
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

type Params = { preset?: string; from?: string; to?: string; cause?: string; fp?: string };

/** Số ảnh lỗi mỗi trang của danh sách ở cuối trang. */
const FAILURE_PAGE_SIZE = 20;
const FIX_TONE: Record<FailureFix, string> = {
  admin: "border-red-300 bg-red-50 text-red-800",
  review: "border-amber-300 bg-amber-50 text-amber-900",
  retry: "border-emerald-300 bg-emerald-50 text-emerald-800",
};
const RETRY_TEXT = { none: "Chưa tạo lại", ok: "Tạo lại được", failed: "Tạo lại vẫn lỗi", running: "Đang tạo lại" } as const;

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

  const [rows, users, settings, sessions, topCustomers, topMaterials, topStyles, failures, modelCounts, todayByUser] = await Promise.all([
    loadUsageRows(range.from, range.to),
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, role: true, isActive: true } }),
    getSettings(),
    loadSessionCount(start, end),
    loadTopCustomers(start, end),
    loadTopMaterials(start, end),
    loadTopStyles(start, end),
    loadFailures(start, end),
    loadModelStatusCounts(start, end),
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

  // Phân tích lỗi (D130): đếm theo ẢNH lỗi tạo trong khoảng, phân loại nguyên nhân từ câu lỗi gốc
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const causes = summarizeFailures(failures);
  const failDaily = failuresByDay(failures, range.days, (d) => dayKey.format(d));
  const models = modelFailureRates(modelCounts);
  const activeCause = failureCauseByKey(params.cause);
  const shownFailures = activeCause ? failures.filter((f) => classifyFailure(f.message).key === activeCause.key) : failures;
  const failPage = pageOf(shownFailures, Number(params.fp ?? 1), FAILURE_PAGE_SIZE);
  // giữ nguyên khoảng ngày đang xem khi lọc theo nguyên nhân hoặc sang trang
  const rangeParams: Params = range.preset === "custom" ? { from: range.from, to: range.to } : { preset: range.preset };
  const failHref = (p: { cause?: string; fp?: number }) => `${hrefFor({ ...rangeParams, cause: p.cause, fp: p.fp && p.fp > 1 ? String(p.fp) : undefined })}#loi`;
  const failBars: Bar[] = failDaily.map((d, i) => ({
    label: dm(d.day),
    segments: [{ value: d.failed, className: "bg-red-500" }],
    title: `${dmy(d.day)}: ${d.failed} ảnh lỗi (ngày này có ${nf.format(daily[i].total)} lượt tạo)`,
  }));
  const failedByDay = new Map(failDaily.map((d) => [d.day, d.failed]));

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
      sub:
        totals.failed > 0 ? (
          <a href="#loi" className="underline underline-offset-2">
            Xem phân tích lỗi ở cuối trang
          </a>
        ) : (
          "Không có lỗi"
        ),
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
                <TableHead className="text-right">Ảnh lỗi</TableHead>
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
                  <TableCell className={cn("text-right tabular-nums", (failedByDay.get(d.day) ?? 0) > 0 && "text-red-600")}>{nf.format(failedByDay.get(d.day) ?? 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{nf.format(d.tokens)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>

      {/* Phân tích lỗi tạo ảnh (D130) */}
      <section id="loi" className="flex scroll-mt-20 flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold">Phân tích lỗi tạo ảnh</h2>
          <p className="text-muted-foreground">
            {failures.length === 0
              ? "Không có ảnh nào bị lỗi trong khoảng này."
              : `${nf.format(failures.length)} ảnh lỗi trong khoảng đã chọn, gom theo nguyên nhân để biết nên sửa gì trước.`}{" "}
            Lỗi của trợ lý Zalo (bot không xử lý được lệnh) xem ở{" "}
            <Link href="/admin/zalo#loi-tro-ly" className="underline underline-offset-4">
              Cài đặt Zalo
            </Link>
            .
          </p>
          {failures.length > 0 && failures.length !== totals.failed && (
            <p className="text-xs text-muted-foreground">
              Phần này đếm theo ảnh. Ô &quot;Ảnh lỗi&quot; ở đầu trang đếm theo lượt tạo (ảnh chất lượng cao tính mỗi mảnh một lượt) nên hai số có thể lệch nhau.
            </p>
          )}
          {failures.length >= FAILURE_SCAN_LIMIT && (
            <p className="text-xs text-amber-700">Chỉ phân tích {nf.format(FAILURE_SCAN_LIMIT)} ảnh lỗi mới nhất. Chọn khoảng ngày ngắn hơn để xem đủ.</p>
          )}
        </div>

        {failures.length > 0 && (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Ảnh lỗi theo ngày</CardTitle>
                  <CardDescription>Lỗi dồn vào vài ngày thường do sự cố bên ngoài (hết token, kie.ai quá tải); lỗi rải đều thường do cấu hình hoặc dữ liệu.</CardDescription>
                </CardHeader>
                <CardContent>
                  <DailyBars bars={failBars} format={(n) => nf.format(Math.round(n))} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Tỉ lệ lỗi theo model AI</CardTitle>
                  <CardDescription>Tính trên ảnh đã có kết quả (xong hoặc lỗi) tạo trong khoảng này. Model lỗi nhiều đứng trước.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead className="min-w-28">Tỉ lệ lỗi</TableHead>
                        <TableHead className="text-right">Lỗi</TableHead>
                        <TableHead className="text-right">Ảnh có kết quả</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {models.slice(0, 8).map((m) => (
                        <TableRow key={m.model}>
                          <TableCell className="max-w-56 min-w-36 font-medium break-all whitespace-normal">{m.model}</TableCell>
                          {/* tỉ lệ đứng ngay sau tên model: trên điện thoại bảng phải cuộn ngang, cột này cần thấy trước */}
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="w-12 text-right tabular-nums">{m.rate === null ? "—" : `${nf.format(m.rate)}%`}</span>
                              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                <span className="block h-full rounded-full bg-red-500" style={{ width: `${m.rate ?? 0}%` }} />
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className={cn("text-right tabular-nums", m.failed > 0 && "text-red-600")}>{nf.format(m.failed)}</TableCell>
                          <TableCell className="text-right tabular-nums">{nf.format(m.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Lỗi theo nguyên nhân</CardTitle>
                <CardDescription>Bấm vào tên nguyên nhân để chỉ xem các ảnh lỗi đó ở danh sách bên dưới.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col divide-y">
                  {causes.map((c) => (
                    <li key={c.key} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-5">
                      <div className="flex shrink-0 items-baseline gap-2 sm:w-28 sm:flex-col sm:gap-0">
                        <span className="text-2xl font-semibold tabular-nums">{nf.format(c.count)}</span>
                        <span className="text-xs text-muted-foreground">
                          ảnh · {nf.format(c.share)}%
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={failHref({ cause: c.key })} className="font-medium underline-offset-4 hover:underline">
                            {c.label}
                          </Link>
                          <span className={cn("rounded-full border px-2 py-0.5 text-xs", FIX_TONE[c.fix])}>{FIX_LABEL[c.fix]}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{c.advice}</p>
                        <p className="text-xs text-muted-foreground">
                          Catalog {nf.format(c.sheet)} · Thiết kế {nf.format(c.design)}
                          {c.retried > 0 && ` · Tạo lại ra ảnh ${nf.format(c.retryOk)}/${nf.format(c.retried)}`}
                          {` · Gần nhất ${fmtTime.format(c.lastAt)}`}
                          {c.materials.length > 0 && ` · Chất liệu: ${c.materials.map((m) => `${m.code} (${m.count})`).join(", ")}`}
                        </p>
                        {c.sample && (
                          <p className="text-xs wrap-break-word text-red-700">
                            Câu lỗi gốc{c.variants > 1 ? ` hay gặp nhất (${c.variants} kiểu câu)` : ""}: {c.sample.length > 300 ? `${c.sample.slice(0, 300)}…` : c.sample}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  Danh sách ảnh lỗi
                  {activeCause && (
                    <>
                      <Badge variant="secondary">{activeCause.label}</Badge>
                      <Link href={failHref({})} className="text-sm font-normal underline underline-offset-4">
                        Bỏ lọc
                      </Link>
                    </>
                  )}
                </CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    {failPage.from === 0
                      ? "Không có ảnh lỗi nào thuộc nguyên nhân này."
                      : `Ảnh ${failPage.from} đến ${failPage.to} trên ${nf.format(shownFailures.length)}, mới nhất trước.`}
                  </span>
                  <a href={`${exportHref}&type=failures`} className="underline underline-offset-4">
                    Tải CSV ảnh lỗi
                  </a>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ul className="flex flex-col divide-y">
                  {failPage.items.map((f) => (
                    <li key={f.id} className="flex flex-col gap-1 py-3 text-sm first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-muted-foreground tabular-nums">{fmtTime.format(f.at)}</span>
                        <span className="font-medium">{f.brand}</span>
                        <span className="text-muted-foreground">{f.userName}</span>
                        <Badge variant="outline">{f.kind === "SHEET" ? "Catalog" : "Thiết kế"}</Badge>
                        {!activeCause && <Badge variant="secondary">{classifyFailure(f.message).label}</Badge>}
                        <span className={cn("text-xs", f.retry === "ok" ? "text-emerald-700" : f.retry === "failed" ? "text-red-700" : "text-muted-foreground")}>
                          {RETRY_TEXT[f.retry]}
                        </span>
                        <Link href={`/sessions/${f.sessionId}`} className="ml-auto shrink-0 underline">
                          Mở phiên
                        </Link>
                      </div>
                      <p className="wrap-break-word text-red-700">{f.message ?? "Không có thông báo lỗi"}</p>
                      <p className="text-xs break-all text-muted-foreground">
                        Model {f.model}
                        {f.materialCode && ` · Chất liệu ${f.materialCode}`}
                        {f.attempt > 1 && ` · hệ thống đã tự thử lại ${f.attempt - 1} lần`}
                      </p>
                    </li>
                  ))}
                </ul>
                {failPage.pages > 1 && (
                  <nav className="flex items-center justify-between gap-3 border-t pt-3 text-sm" aria-label="Chuyển trang danh sách ảnh lỗi">
                    {failPage.page > 1 ? (
                      <Link href={failHref({ cause: activeCause?.key, fp: failPage.page - 1 })} className={buttonVariants({ variant: "outline", className: "h-9" })}>
                        Trang trước
                      </Link>
                    ) : (
                      <span />
                    )}
                    <span className="text-muted-foreground tabular-nums">
                      Trang {failPage.page}/{failPage.pages}
                    </span>
                    {failPage.page < failPage.pages ? (
                      <Link href={failHref({ cause: activeCause?.key, fp: failPage.page + 1 })} className={buttonVariants({ variant: "outline", className: "h-9" })}>
                        Trang sau
                      </Link>
                    ) : (
                      <span />
                    )}
                  </nav>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </section>
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
