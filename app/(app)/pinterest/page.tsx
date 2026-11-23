import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLinkIcon, ImageOffIcon, PinIcon, SearchIcon } from "lucide-react";
import { CopyImageIconButton, CopyImagesButton } from "@/components/copy-images";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { pageWindow } from "@/lib/pagination";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mẫu Pinterest" };

const PAGE_SIZE = 48;
type Params = { board?: string; q?: string; page?: string };

function pageHref(boardId: string, q: string, page: number): string {
  const sp = new URLSearchParams({ board: boardId });
  if (q) sp.set("q", q);
  if (page > 1) sp.set("page", String(page));
  return `/pinterest?${sp.toString()}`;
}

export default async function PinterestLibraryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const boards = await db.pinterestBoard.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { pins: true } } },
  });
  const selected = boards.find((board) => board.id === params.board) ?? boards[0] ?? null;

  const where = selected
    ? {
        boardId: selected.id,
        ...(q
          ? {
              OR: [{ title: { contains: q } }, { description: { contains: q } }, { altText: { contains: q } }],
            }
          : {}),
      }
    : null;
  const total = where ? await db.pinterestPin.count({ where }) : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Math.min(Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1, totalPages);
  const pins = where
    ? await db.pinterestPin.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: { id: true, pinterestPinId: true, title: true, description: true, altText: true, sourceImageUrl: true },
      })
    : [];

  const copyImages = pins.map((pin, index) => ({
    id: pin.id,
    label: pin.title || `Mẫu ${index + 1}`,
    url: `/api/pinterest/pins/${pin.id}/image`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><PinIcon /> Mẫu Pinterest</h1>
          <p className="text-muted-foreground">Xem ảnh đã đồng bộ, copy để gửi khách hoặc chọn làm phong cách tham khảo ở bước thiết kế.</p>
        </div>
        {user.role === "ADMIN" && (
          <Link href="/admin/pinterest" className={buttonVariants({ variant: "outline" })}>
            Kết nối và đồng bộ
          </Link>
        )}
      </div>

      {boards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <ImageOffIcon className="size-10" />
          <p>Chưa có board hoặc pin nào được đồng bộ.</p>
          {user.role === "ADMIN" && <Link href="/admin/pinterest" className={buttonVariants()}>Thiết lập Pinterest</Link>}
        </div>
      ) : (
        <>
          <form method="get" className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[minmax(12rem,0.8fr)_minmax(14rem,1.4fr)_auto]">
            <NativeSelect name="board" defaultValue={selected?.id} aria-label="Chọn board Pinterest">
              {boards.map((board) => (
                <option key={board.id} value={board.id}>{board.name} ({board._count.pins})</option>
              ))}
            </NativeSelect>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={q} placeholder="Tìm theo tên hoặc mô tả pin" className="pl-9" aria-label="Tìm pin" />
            </div>
            <Button type="submit">Lọc</Button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{selected?.name}</h2>
            <Badge variant="secondary">{total} pin</Badge>
            {selected?.privacy !== "PUBLIC" && <Badge variant="outline">{selected?.privacy === "SECRET" ? "Bí mật" : "Hạn chế"}</Badge>}
            <CopyImagesButton images={copyImages} label="Copy các ảnh trang này" className="ml-auto" />
          </div>

          {pins.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">Không có pin nào khớp bộ lọc.</div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {pins.map((pin) => {
                const label = pin.title || pin.altText || "Mẫu Pinterest";
                return (
                  <li key={pin.id} className="group overflow-hidden rounded-xl border bg-card">
                    <a href={pin.sourceImageUrl} target="_blank" rel="noreferrer noopener" className="block overflow-hidden bg-muted">
                      <img src={pin.sourceImageUrl} alt={label} className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.02]" loading="lazy" />
                    </a>
                    <div className="flex items-center gap-2 p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" title={label}>{label}</p>
                        {pin.description && <p className="truncate text-xs text-muted-foreground">{pin.description}</p>}
                      </div>
                      <CopyImageIconButton url={`/api/pinterest/pins/${pin.id}/image`} label={label} />
                      <a
                        href={`https://www.pinterest.com/pin/${encodeURIComponent(pin.pinterestPinId)}/`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={cn(buttonVariants({ variant: "outline", size: "icon" }), "size-8")}
                        title="Mở pin trên Pinterest"
                        aria-label={`Mở ${label} trên Pinterest`}
                      >
                        <ExternalLinkIcon />
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {totalPages > 1 && selected && (
            <nav aria-label="Phân trang pin Pinterest" className="flex flex-wrap justify-center gap-1">
              {pageWindow(page, totalPages).map((n, index) =>
                n === null ? (
                  <span key={`gap-${index}`} className="px-2 py-1 text-muted-foreground">…</span>
                ) : (
                  <Link
                    key={n}
                    href={pageHref(selected.id, q, n)}
                    className={buttonVariants({ variant: n === page ? "default" : "outline", size: "sm" })}
                    aria-current={n === page ? "page" : undefined}
                  >
                    {n}
                  </Link>
                ),
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
