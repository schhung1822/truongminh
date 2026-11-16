import type { Metadata } from "next";
import Link from "next/link";
import {
  BoxesIcon,
  CircleCheckIcon,
  CirclePauseIcon,
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getUsedMaterialIds } from "@/lib/materials/usage";
import { fileUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { MaterialsBoard, type BoardItem } from "./materials-board";

export const metadata: Metadata = { title: "Chất liệu" };

const PAGE_SIZE = 60;

type Params = { q?: string; group?: string; status?: string; view?: string; page?: string };

/** Dựng đường dẫn giữ nguyên các bộ lọc, chỉ đổi những phần được chỉ định. */
function href(current: Params, change: Params): string {
  const merged = { ...current, ...change };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v && !(k === "view" && v === "grid") && !(k === "page" && v === "1")) sp.set(k, v);
  }
  const s = sp.toString();
  return `/admin/materials${s ? `?${s}` : ""}`;
}

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const group = params.group ?? "";
  const status = ["active", "inactive", "todo"].includes(params.status ?? "") ? (params.status as string) : "";
  const view = params.view === "list" ? "list" : "grid";
  const page = Math.max(1, Number(params.page) || 1);
  const current: Params = { q, group, status, view, page: String(page) };

  // "Cần bổ sung" = thiếu ảnh tham chiếu hoặc thiếu mô tả cho AI
  const todoWhere = { OR: [{ referencePath: null }, { descAi: "" }] };
  const where = {
    ...(q ? { AND: [{ OR: [{ code: { contains: q } }, { name: { contains: q } }, { printTech: { contains: q } }] }] } : {}),
    ...(group ? { groupName: group } : {}),
    ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
    ...(status === "todo" ? todoWhere : {}),
  };

  const [rows, filteredTotal, total, active, todo, groupCounts, used] = await Promise.all([
    db.material.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { sheetMaterials: { include: { sheet: { select: { name: true } } } } },
    }),
    db.material.count({ where }),
    db.material.count(),
    db.material.count({ where: { isActive: true } }),
    db.material.count({ where: todoWhere }),
    db.material.groupBy({ by: ["groupName"], _count: { _all: true }, orderBy: { groupName: "asc" } }),
    getUsedMaterialIds(),
  ]);

  const items: BoardItem[] = rows.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    groupName: m.groupName,
    printTech: m.printTech,
    descHuman: m.descHuman,
    descAi: m.descAi,
    isActive: m.isActive,
    refUrl: fileUrl(m.referencePath),
    sheets: [...new Set(m.sheetMaterials.map((sm) => sm.sheet.name))],
    used: used.has(m.id),
  }));

  const pages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const stats = [
    { key: "", label: "Tất cả", value: total, icon: <BoxesIcon />, tone: "text-foreground" },
    { key: "active", label: "Đang bật", value: active, icon: <CircleCheckIcon />, tone: "text-emerald-600" },
    { key: "inactive", label: "Đã tắt", value: total - active, icon: <CirclePauseIcon />, tone: "text-zinc-500" },
    { key: "todo", label: "Cần bổ sung", value: todo, icon: <TriangleAlertIcon />, tone: "text-amber-600" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Chất liệu</h1>
          <p className="text-muted-foreground">Thư viện chất liệu của xưởng. Bấm vào ảnh để xem lớn.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/materials/import" className={buttonVariants({ variant: "outline", className: "h-10" })}>
            <UploadIcon /> Nhập từ CSV
          </Link>
          <Link href="/admin/materials/new" className={buttonVariants({ className: "h-10" })}>
            <PlusIcon /> Thêm chất liệu
          </Link>
        </div>
      </div>

      {/* Thống kê nhanh, bấm để lọc */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <li key={s.label}>
            <Link
              href={href(current, { status: s.key, page: "1" })}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/60",
                status === s.key && "border-primary ring-1 ring-primary",
              )}
            >
              <span className={cn("flex size-10 items-center justify-center rounded-lg bg-muted [&_svg]:size-5", s.tone)}>{s.icon}</span>
              <span className="flex flex-col leading-tight">
                <span className="text-2xl font-semibold tabular-nums">{s.value}</span>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Tìm kiếm + chuyển kiểu xem */}
      <div className="flex flex-wrap items-center gap-3">
        <form method="get" className="relative min-w-60 flex-1 sm:max-w-md">
          {group && <input type="hidden" name="group" value={group} />}
          {status && <input type="hidden" name="status" value={status} />}
          {view === "list" && <input type="hidden" name="view" value="list" />}
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Tìm theo mã, tên, công nghệ in" className="h-10 pl-9" aria-label="Tìm chất liệu" />
        </form>
        <div className="flex rounded-lg border p-0.5" role="group" aria-label="Kiểu hiển thị">
          <Link
            href={href(current, { view: "grid" })}
            className={cn(buttonVariants({ variant: view === "grid" ? "secondary" : "ghost", size: "sm" }), "h-8")}
            aria-pressed={view === "grid"}
          >
            <LayoutGridIcon /> Thẻ
          </Link>
          <Link
            href={href(current, { view: "list" })}
            className={cn(buttonVariants({ variant: view === "list" ? "secondary" : "ghost", size: "sm" }), "h-8")}
            aria-pressed={view === "list"}
          >
            <ListIcon /> Danh sách
          </Link>
        </div>
        {(q || group || status) && (
          <Link href={href({ view }, {})} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Xóa bộ lọc
          </Link>
        )}
      </div>

      {/* Lọc theo nhóm */}
      {groupCounts.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo nhóm">
          <Link
            href={href(current, { group: "", page: "1" })}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              !group ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            Mọi nhóm
          </Link>
          {groupCounts.map((g) => (
            <Link
              key={g.groupName}
              href={href(current, { group: g.groupName, page: "1" })}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                group === g.groupName ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {g.groupName} <span className="opacity-70">({g._count._all})</span>
            </Link>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <BoxesIcon className="size-10" />
          <p>{total === 0 ? 'Chưa có chất liệu nào. Bấm "Thêm chất liệu" hoặc nhập từ CSV.' : "Không có chất liệu khớp bộ lọc."}</p>
        </div>
      ) : (
        <MaterialsBoard key={`${q}|${group}|${status}|${view}|${page}`} items={items} view={view} />
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label="Phân trang">
          {page > 1 ? (
            <Link href={href(current, { page: String(page - 1) })} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Trang trước
            </Link>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Trang trước
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            Trang {page}/{pages} ({filteredTotal} chất liệu)
          </span>
          {page < pages ? (
            <Link href={href(current, { page: String(page + 1) })} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Trang sau
            </Link>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Trang sau
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
