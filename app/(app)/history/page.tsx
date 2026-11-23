import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarIcon,
  CoinsIcon,
  DownloadIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  ImageOffIcon,
  PaletteIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CopyImagesButton } from "@/components/copy-images";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { fileUrl } from "@/lib/storage";
import { zonedStartOfDay } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Lịch sử" };

const LIMIT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

type Params = { q?: string; sale?: string; from?: string; to?: string };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const sale = params.sale ?? "";
  const tz = getEnv().APP_TIMEZONE;
  const fromDate = zonedStartOfDay(params.from ?? "", tz);
  const toStart = zonedStartOfDay(params.to ?? "", tz);
  const toEnd = toStart ? new Date(toStart.getTime() + DAY_MS) : null;
  const filtering = !!(q || sale || fromDate || toEnd);

  const [sessions, users] = await Promise.all([
    db.consultSession.findMany({
      where: {
        type: "CATALOG",
        ...(sale ? { createdById: sale === "me" ? user.id : sale } : {}),
        ...(fromDate || toEnd ? { createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toEnd ? { lt: toEnd } : {}) } } : {}),
        ...(q
          ? {
              logo: {
                brand: {
                  OR: [
                    { name: { contains: q } },
                    { customer: { OR: [{ name: { contains: q } }, { phone: { contains: q } }] } },
                  ],
                },
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      include: {
        createdBy: { select: { name: true } },
        logo: { include: { brand: { include: { customer: true } } } },
        images: {
          where: { retries: { none: {} } },
          orderBy: { createdAt: "asc" },
          select: { id: true, status: true, finalPath: true, costCredits: true },
        },
        _count: { select: { children: true } },
      },
    }),
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // Gom thành cây Khách hàng > Thương hiệu > Logo > Phiên (khách có phiên mới nhất lên đầu)
  type Session = (typeof sessions)[number];
  const tree = new Map<
    string,
    { customer: Session["logo"]["brand"]["customer"]; brands: Map<string, { brand: Session["logo"]["brand"]; logos: Map<string, { logo: Session["logo"]; sessions: Session[] }> }> }
  >();
  for (const s of sessions) {
    const { brand } = s.logo;
    const c = tree.get(brand.customerId) ?? { customer: brand.customer, brands: new Map() };
    tree.set(brand.customerId, c);
    const b = c.brands.get(brand.id) ?? { brand, logos: new Map() };
    c.brands.set(brand.id, b);
    const l = b.logos.get(s.logoId) ?? { logo: s.logo, sessions: [] };
    b.logos.set(s.logoId, l);
    l.sessions.push(s);
  }

  const totalImages = sessions.reduce((n, s) => n + s.images.filter((i) => i.status === "SUCCESS").length, 0);
  const totalCredits = sessions.reduce((n, s) => n + s.images.reduce((m, i) => m + (i.costCredits ?? 0), 0), 0);
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: tz });
  const nf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
  const isAdmin = user.role === "ADMIN";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Lịch sử</h1>
        <p className="text-muted-foreground">
          Mọi phiên đã tạo, gom theo Khách hàng &gt; Thương hiệu &gt; Logo. Ảnh được lưu lại trên máy chủ, mở lại hoặc tải về bất cứ lúc nào.
        </p>
      </div>

      <form method="get" className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Tên khách, thương hiệu hoặc số điện thoại" className="h-10 pl-9" aria-label="Tìm kiếm" />
        </div>
        <NativeSelect name="sale" defaultValue={sale} aria-label="Lọc theo sale">
          <option value="">Mọi sale</option>
          <option value="me">Của tôi</option>
          {users
            .filter((u) => u.id !== user.id)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </NativeSelect>
        <Input type="date" name="from" defaultValue={params.from ?? ""} className="h-10" aria-label="Từ ngày" />
        <Input type="date" name="to" defaultValue={params.to ?? ""} className="h-10" aria-label="Đến ngày" />
        <div className="flex gap-2">
          <Button type="submit" className="h-10 px-5">
            Lọc
          </Button>
          {filtering && (
            <Link href="/history" className={buttonVariants({ variant: "ghost", className: "h-10" })}>
              Xóa lọc
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-muted-foreground">
        {sessions.length} phiên · {totalImages} ảnh đã xong
        {isAdmin && totalCredits > 0 && ` · ${nf.format(totalCredits)} token`}
        {sessions.length === LIMIT && ` · chỉ hiện ${LIMIT} phiên mới nhất, hãy dùng bộ lọc để thu hẹp`}
      </p>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <FolderOpenIcon className="size-10" />
          <p>{filtering ? "Không có phiên nào khớp bộ lọc." : "Chưa có phiên nào. Tạo phiên đầu tiên ở Trang chính."}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {[...tree.values()].map((c, ci) => {
            const count = [...c.brands.values()].reduce((n, b) => n + [...b.logos.values()].reduce((m, l) => m + l.sessions.length, 0), 0);
            return (
              <li key={c.customer.id}>
                <details open={filtering || ci === 0} className="group rounded-xl border bg-card">
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-3 select-none [&::-webkit-details-marker]:hidden">
                    <FolderIcon className="size-7 fill-amber-300 text-amber-500 group-open:hidden" strokeWidth={1.5} />
                    <FolderOpenIcon className="hidden size-7 fill-amber-300 text-amber-500 group-open:block" strokeWidth={1.5} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.customer.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{c.customer.phone || "Chưa có số điện thoại"}</span>
                    </span>
                    <Badge variant="secondary">{count} phiên</Badge>
                  </summary>

                  <div className="flex flex-col gap-3 border-t p-3 pl-4 sm:pl-8">
                    {[...c.brands.values()].map((b) => (
                      <details key={b.brand.id} open className="group/b">
                        <summary className="flex cursor-pointer list-none items-center gap-2 py-1 select-none [&::-webkit-details-marker]:hidden">
                          <FolderIcon className="size-5 fill-amber-200 text-amber-500 group-open/b:hidden" strokeWidth={1.5} />
                          <FolderOpenIcon className="hidden size-5 fill-amber-200 text-amber-500 group-open/b:block" strokeWidth={1.5} />
                          <span className="font-medium">{b.brand.name}</span>
                        </summary>

                        <div className="flex flex-col gap-4 py-2 pl-2 sm:pl-7">
                          {[...b.logos.values()].map((l) => (
                            <div key={l.logo.id} className="flex flex-col gap-2">
                              <div className="flex flex-wrap items-center gap-3">
                                <span
                                  className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
                                  style={{
                                    backgroundColor: "#fff",
                                    backgroundImage:
                                      "linear-gradient(45deg,#e5e5e5 25%,transparent 25%),linear-gradient(-45deg,#e5e5e5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e5e5 75%),linear-gradient(-45deg,transparent 75%,#e5e5e5 75%)",
                                    backgroundSize: "12px 12px",
                                    backgroundPosition: "0 0,0 6px,6px -6px,-6px 0",
                                  }}
                                >
                                  <img src={fileUrl(l.logo.normalizedPath)!} alt="Logo" className="max-h-full max-w-full object-contain" />
                                </span>
                                <span className="text-sm text-muted-foreground">
                                  Logo {l.logo.width}x{l.logo.height}px · {l.sessions.length} phiên
                                </span>
                                <div className="ml-auto flex flex-wrap gap-2">
                                  <CopyImagesButton
                                    label="Copy ảnh của logo này"
                                    images={l.sessions.flatMap((s) =>
                                      s.images
                                        .filter((i) => i.status === "SUCCESS" && i.finalPath)
                                        .map((i, n) => ({ id: i.id, label: `${fmt.format(s.createdAt)} · Ảnh ${n + 1}`, url: fileUrl(i.finalPath)! })),
                                    )}
                                  />
                                  <Link
                                    href={`/?logoId=${encodeURIComponent(l.logo.id)}`}
                                    className={buttonVariants({ variant: "outline", size: "sm" })}
                                  >
                                    <SparklesIcon /> Tạo phiên mới với logo này
                                  </Link>
                                </div>
                              </div>

                              <ul className="flex flex-col gap-2">
                                {l.sessions.map((s) => {
                                  const done = s.images.filter((i) => i.status === "SUCCESS");
                                  const failed = s.images.filter((i) => i.status === "FAILED").length;
                                  const running = s.images.length - done.length - failed;
                                  const credits = s.images.reduce((n, i) => n + (i.costCredits ?? 0), 0);
                                  return (
                                    <li key={s.id}>
                                      <Card className="py-2">
                                        <CardContent className="flex flex-wrap items-center gap-3">
                                          <div className="flex min-w-48 flex-1 flex-col gap-1">
                                            <span className="flex items-center gap-1.5 text-sm font-medium">
                                              <CalendarIcon className="size-4 text-muted-foreground" />
                                              {fmt.format(s.createdAt)}
                                            </span>
                                            <span className="text-xs text-muted-foreground">Sale: {s.createdBy.name}</span>
                                            <span className="flex flex-wrap items-center gap-1.5">
                                              <Badge>{done.length}/{s.images.length} ảnh xong</Badge>
                                              {running > 0 && <Badge variant="secondary">{running} đang tạo</Badge>}
                                              {failed > 0 && <Badge variant="destructive">{failed} lỗi</Badge>}
                                              {s._count.children > 0 && (
                                                <Badge variant="outline" className="gap-1">
                                                  <PaletteIcon className="size-3" /> {s._count.children} lượt thiết kế
                                                </Badge>
                                              )}
                                              {isAdmin && credits > 0 && (
                                                <Badge variant="outline" className="gap-1">
                                                  <CoinsIcon className="size-3" /> {nf.format(credits)} token
                                                </Badge>
                                              )}
                                            </span>
                                          </div>

                                          <div className="flex gap-2">
                                            {done.slice(0, 4).map((i) => (
                                              <Link key={i.id} href={`/sessions/${s.id}`} className="block overflow-hidden rounded-md border bg-muted">
                                                <img
                                                  src={`/api/images/${i.id}/thumb?v=${encodeURIComponent((i.finalPath ?? "").slice(-14))}`}
                                                  alt="Ảnh đã tạo"
                                                  className={cn("h-16 w-auto min-w-12 object-cover")}
                                                  loading="lazy"
                                                />
                                              </Link>
                                            ))}
                                            {done.length === 0 && (
                                              <span className="flex h-16 w-24 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                                                <ImageOffIcon className="size-5" />
                                              </span>
                                            )}
                                          </div>

                                          <div className="flex flex-wrap gap-1.5">
                                            <Link href={`/sessions/${s.id}`} className={buttonVariants({ size: "sm" })}>
                                              Mở phiên
                                            </Link>
                                            {done.length > 0 && (
                                              <>
                                                <a href={`/api/sessions/${s.id}/download?format=zip`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                                                  <DownloadIcon /> ZIP
                                                </a>
                                                <a href={`/api/sessions/${s.id}/download?format=pdf`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                                                  <FileTextIcon /> PDF
                                                </a>
                                              </>
                                            )}
                                          </div>
                                        </CardContent>
                                      </Card>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
