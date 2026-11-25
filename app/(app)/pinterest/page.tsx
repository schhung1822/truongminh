import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLinkIcon, ImageOffIcon, PinIcon, SearchIcon } from "lucide-react";
import { CopyImageIconButton, CopyImagesButton } from "@/components/copy-images";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { pageWindow } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { FavoritePinButton } from "./favorite-pin-button";
import { PinImage } from "./pin-image";
import { PinStyleTagEditor } from "./pin-style-tags";

export const metadata: Metadata = { title: "Mẫu Pinterest" };

const PAGE_SIZE = 48;
/** Pin đồng bộ trong N ngày gần nhất được coi là "mới" (hiện badge), không cần cấu hình gì thêm. */
const NEW_PIN_WINDOW_DAYS = 3;
type Params = { board?: string; q?: string; tag?: string; page?: string; logoId?: string };

function linkHref(opts: { boardId: string; q: string; tag: string; logoId?: string; page?: number }): string {
  const sp = new URLSearchParams({ board: opts.boardId });
  if (opts.q) sp.set("q", opts.q);
  if (opts.tag) sp.set("tag", opts.tag);
  if (opts.logoId) sp.set("logoId", opts.logoId);
  if (opts.page && opts.page > 1) sp.set("page", String(opts.page));
  return `/pinterest?${sp.toString()}`;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export default async function PinterestLibraryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const tag = (params.tag ?? "").trim().slice(0, 60);
  const isAdmin = user.role === "ADMIN";
  const newSince = daysAgo(NEW_PIN_WINDOW_DAYS);
  const logoIdParam = (params.logoId ?? "").trim().slice(0, 191);

  const [boards, styleTagOptions, newCountsByBoard, logoContext] = await Promise.all([
    db.pinterestBoard.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { pins: true } } } }),
    db.materialOption.findMany({ where: { type: "STYLE_TAG", isActive: true }, orderBy: { sortOrder: "asc" }, select: { value: true, label: true } }),
    db.pinterestPin.groupBy({ by: ["boardId"], where: { createdAt: { gte: newSince } }, _count: { _all: true } }),
    logoIdParam
      ? db.logo.findUnique({ where: { id: logoIdParam }, select: { id: true, brand: { select: { name: true, customer: { select: { name: true } } } } } })
      : null,
  ]);
  // logoId không hợp lệ/đã xóa: coi như không có ngữ cảnh khách, không chặn xem trang
  const logoId = logoContext?.id ?? "";
  const newCountByBoardId = new Map(newCountsByBoard.map((r) => [r.boardId, r._count._all]));
  const selected = boards.find((board) => board.id === params.board) ?? boards[0] ?? null;

  const where = selected
    ? {
        boardId: selected.id,
        ...(q ? { OR: [{ title: { contains: q } }, { description: { contains: q } }, { altText: { contains: q } }] } : {}),
        ...(tag ? { styleTags: { some: { value: tag } } } : {}),
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
        select: {
          id: true,
          pinterestPinId: true,
          title: true,
          description: true,
          altText: true,
          sourceImageUrl: true,
          createdAt: true,
          styleTags: isAdmin ? { select: { value: true } } : false,
        },
      })
    : [];

  const favoritedPinIds = logoId && pins.length
    ? new Set((await db.logoFavoritePin.findMany({ where: { logoId, pinId: { in: pins.map((p) => p.id) } }, select: { pinId: true } })).map((f) => f.pinId))
    : new Set<string>();

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

      {logoContext && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 px-3 py-2 text-sm">
          <span>
            Đang chọn ảnh cho <b>{logoContext.brand.customer.name}</b> · {logoContext.brand.name} — bấm tim trên ảnh để lưu pin khách thích.
          </span>
          <Link href="/customers" className="ml-auto underline underline-offset-4">
            Xong, về Khách hàng
          </Link>
        </div>
      )}

      {boards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <ImageOffIcon className="size-10" />
          <p>Chưa có board hoặc pin nào được đồng bộ.</p>
          {user.role === "ADMIN" && <Link href="/admin/pinterest" className={buttonVariants()}>Thiết lập Pinterest</Link>}
        </div>
      ) : (
        <>
          <nav className="flex gap-4 overflow-x-auto border-b" aria-label="Chọn board Pinterest">
            {boards.map((board) => {
              const active = board.id === selected?.id;
              const newCount = newCountByBoardId.get(board.id) ?? 0;
              return (
                <Link
                  key={board.id}
                  href={linkHref({ boardId: board.id, q, tag, logoId })}
                  className={cn(
                    "shrink-0 border-b-2 px-0.5 pb-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                    active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {board.name} <span className="text-xs text-muted-foreground">({board._count.pins})</span>
                  {newCount > 0 && (
                    <Badge className="ml-1 align-middle" variant="secondary">
                      +{newCount} mới
                    </Badge>
                  )}
                </Link>
              );
            })}
          </nav>

          {styleTagOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Lọc theo phong cách">
              {styleTagOptions.map((opt) => {
                const active = tag === opt.value;
                return (
                  <Link
                    key={opt.value}
                    href={linkHref({ boardId: selected?.id ?? "", q, tag: active ? "" : opt.value, logoId })}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm transition-colors",
                      active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {opt.label}
                  </Link>
                );
              })}
            </div>
          )}

          <form method="get" className="flex gap-2">
            <input type="hidden" name="board" value={selected?.id} />
            <input type="hidden" name="tag" value={tag} />
            <input type="hidden" name="logoId" value={logoId} />
            <div className="relative flex-1 sm:max-w-sm">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={q} placeholder="Tìm theo tên hoặc mô tả pin" className="pl-9" aria-label="Tìm pin" />
            </div>
            <Button type="submit" variant="outline">Tìm</Button>
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
            <ul className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-6">
              {pins.map((pin) => {
                const label = pin.title || pin.altText || "Mẫu Pinterest";
                const isNew = pin.createdAt >= newSince;
                return (
                  <li key={pin.id} className="mb-3 break-inside-avoid">
                    <div className="group overflow-hidden rounded-xl border bg-card">
                      <a href={pin.sourceImageUrl} target="_blank" rel="noreferrer noopener" className="block">
                        <PinImage src={pin.sourceImageUrl} alt={label} isNew={isNew} />
                      </a>
                      <div className="flex items-center gap-2 p-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium" title={label}>{label}</p>
                          {pin.description && <p className="truncate text-xs text-muted-foreground">{pin.description}</p>}
                        </div>
                        {isAdmin && (
                          <PinStyleTagEditor pinId={pin.id} label={label} options={styleTagOptions} selected={pin.styleTags?.map((t) => t.value) ?? []} />
                        )}
                        {logoContext && (
                          <FavoritePinButton logoId={logoId} pinId={pin.id} label={label} initialFavorited={favoritedPinIds.has(pin.id)} />
                        )}
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
                    href={linkHref({ boardId: selected.id, q, tag, logoId, page: n })}
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
