import type { Metadata } from "next";
import Link from "next/link";
import {
  BoxesIcon,
  CalculatorIcon,
  CircleCheckIcon,
  CirclePauseIcon,
  DownloadIcon,
  EyeIcon,
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
  RulerIcon,
  SearchIcon,
  TagsIcon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { loadOptions } from "@/lib/materials/options";
import { optionLabel, PHOTO_ISSUES } from "@/lib/materials/option-types";
import { decimalToNumber, describeStock } from "@/lib/materials/stock";
import { getUsedMaterialIds } from "@/lib/materials/usage";
import { fileUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { MaterialFilters } from "./materials-filters";
import { MaterialsBoard, type BoardItem } from "./materials-board";

export const metadata: Metadata = { title: "Chất liệu" };

const PAGE_SIZE = 60;

type Params = {
  q?: string;
  status?: string;
  view?: string;
  page?: string;
  base?: string;
  tech?: string;
  finish?: string;
  pattern?: string;
  colors?: string;
  color?: string;
  tag?: string;
};

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

// địa chỉ API tải file (khai báo bằng biến vì đây là tải về, không phải chuyển trang)
const EXPORT_HREF = `/api/admin/materials/export`;

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const status = ["active", "inactive", "todo", "review", "stock"].includes(params.status ?? "") ? (params.status as string) : "";
  const view = params.view === "list" ? "list" : "grid";
  const page = Math.max(1, Number(params.page) || 1);
  const base = params.base ?? "";
  const tech = params.tech ?? "";
  const finish = params.finish ?? "";
  const pattern = params.pattern ?? "";
  const colors = params.colors === "ONE" || params.colors === "TWO" ? params.colors : "";
  const color = params.color ?? "";
  const tag = params.tag ?? "";
  const current: Params = { q, status, view, page: String(page), base, tech, finish, pattern, colors, color, tag };
  const classifyFilters = !!(base || tech || finish || pattern || colors || color || tag);

  // "Cần bổ sung" = thiếu ảnh tham chiếu; "Cần xem lại" = đánh dấu needsReview
  // "Thiếu thông số tấm" = thiếu một trong rộng, cao, giá tấm, lề (khoảng cách trống thì dùng mặc định chung nên không tính)
  const todoWhere: Prisma.MaterialWhereInput = { referencePath: null };
  const reviewWhere: Prisma.MaterialWhereInput = { needsReview: true };
  const stockWhere: Prisma.MaterialWhereInput = { OR: [{ stockWidthMm: null }, { stockHeightMm: null }, { stockPrice: null }, { edgeMarginMm: null }] };
  const and: Prisma.MaterialWhereInput[] = [];
  if (q) and.push({ OR: [{ code: { contains: q } }, { name: { contains: q } }, { printTech: { contains: q } }, { groupName: { contains: q } }] });
  if (status === "stock") and.push(stockWhere);
  if (color) and.push({ OR: [{ frontColorFamily: color }, { backColorFamily: color }] });
  if (tag) and.push({ styleTags: { some: { value: tag } } });
  const where: Prisma.MaterialWhereInput = {
    ...(and.length ? { AND: and } : {}),
    ...(base ? { baseMaterial: base } : {}),
    ...(tech ? { technique: tech } : {}),
    ...(finish ? { surfaceFinish: finish } : {}),
    ...(pattern ? { surfacePattern: pattern } : {}),
    ...(colors ? { colorCount: colors } : {}),
    ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
    ...(status === "todo" ? todoWhere : {}),
    ...(status === "review" ? reviewWhere : {}),
  };

  const [rows, filteredTotal, total, active, todo, review, stockMissing, used, options] = await Promise.all([
    db.material.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        sheetMaterials: { include: { sheet: { select: { name: true } } } },
        styleTags: { select: { value: true } },
      },
    }),
    db.material.count({ where }),
    db.material.count(),
    db.material.count({ where: { isActive: true } }),
    db.material.count({ where: todoWhere }),
    db.material.count({ where: reviewWhere }),
    db.material.count({ where: stockWhere }),
    getUsedMaterialIds(),
    loadOptions(),
  ]);

  const items: BoardItem[] = rows.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    groupName: m.groupName,
    printTech: m.printTech,
    descHuman: m.descHuman,
    thicknessMm: m.thicknessMm,
    isActive: m.isActive,
    refUrl: fileUrl(m.referencePath),
    sheets: [...new Set(m.sheetMaterials.map((sm) => sm.sheet.name))],
    used: used.has(m.id),
    baseLabel: optionLabel(options, "BASE_MATERIAL", m.baseMaterial) || m.groupName,
    techLabel: optionLabel(options, "TECHNIQUE", m.technique) || m.printTech,
    finishLabel: optionLabel(options, "SURFACE_FINISH", m.surfaceFinish),
    patternLabel: optionLabel(options, "SURFACE_PATTERN", m.surfacePattern),
    colorCount: m.colorCount,
    frontColor: { name: m.frontColorName ?? "", family: optionLabel(options, "COLOR_FAMILY", m.frontColorFamily) },
    backColor: { name: m.backColorName ?? "", family: optionLabel(options, "COLOR_FAMILY", m.backColorFamily) },
    seriesLabel: optionLabel(options, "SERIES", m.seriesCode),
    styleTagLabels: m.styleTags.map((t) => optionLabel(options, "STYLE_TAG", t.value)).sort(),
    aiVisualNote: m.aiVisualNote ?? "",
    photoIssueLabels: (m.photoIssue ?? "")
      .split("|")
      .filter(Boolean)
      .map((p) => PHOTO_ISSUES.find((x) => x.value === p)?.label ?? p),
    needsReview: m.needsReview,
    reviewNote: m.reviewNote ?? "",
    stock: describeStock({ stockWidthMm: m.stockWidthMm, stockHeightMm: m.stockHeightMm, stockPrice: decimalToNumber(m.stockPrice), edgeMarginMm: m.edgeMarginMm }),
  }));

  const pages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const stats = [
    { key: "", label: "Tất cả", value: total, icon: <BoxesIcon />, tone: "text-foreground" },
    { key: "active", label: "Đang bật", value: active, icon: <CircleCheckIcon />, tone: "text-emerald-600" },
    { key: "inactive", label: "Đã tắt", value: total - active, icon: <CirclePauseIcon />, tone: "text-zinc-500" },
    { key: "review", label: "Cần xem lại", value: review, icon: <EyeIcon />, tone: "text-amber-600" },
    { key: "todo", label: "Thiếu ảnh", value: todo, icon: <TriangleAlertIcon />, tone: "text-rose-600" },
    { key: "stock", label: "Thiếu thông số tấm", value: stockMissing, icon: <RulerIcon />, tone: "text-orange-600" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Chất liệu</h1>
          <p className="text-muted-foreground">Thư viện chất liệu của xưởng. Bấm vào ảnh để xem lớn.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/quoting/materials" className={buttonVariants({ variant: "outline", className: "h-10" })}>
            <CalculatorIcon /> Thiết lập báo giá
          </Link>
          <Link href="/admin/materials/options" className={buttonVariants({ variant: "outline", className: "h-10" })}>
            <TagsIcon /> Danh mục
          </Link>
          <a href={EXPORT_HREF} className={buttonVariants({ variant: "outline", className: "h-10" })}>
            <DownloadIcon /> Xuất CSV
          </a>
          <Link href="/admin/materials/import" className={buttonVariants({ variant: "outline", className: "h-10" })}>
            <UploadIcon /> Nhập từ CSV
          </Link>
          <Link href="/admin/materials/new" className={buttonVariants({ className: "h-10" })}>
            <PlusIcon /> Thêm chất liệu
          </Link>
        </div>
      </div>

      {/* Thống kê nhanh, bấm để lọc */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
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
          {status && <input type="hidden" name="status" value={status} />}
          {view === "list" && <input type="hidden" name="view" value="list" />}
          {base && <input type="hidden" name="base" value={base} />}
          {tech && <input type="hidden" name="tech" value={tech} />}
          {finish && <input type="hidden" name="finish" value={finish} />}
          {pattern && <input type="hidden" name="pattern" value={pattern} />}
          {colors && <input type="hidden" name="colors" value={colors} />}
          {color && <input type="hidden" name="color" value={color} />}
          {tag && <input type="hidden" name="tag" value={tag} />}
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Tìm theo mã, tên, nhóm, công nghệ in" className="h-10 pl-9" aria-label="Tìm chất liệu" />
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
        {(q || status || classifyFilters) && (
          <Link href={href({ view }, {})} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Xóa bộ lọc
          </Link>
        )}
      </div>

      {/* Lọc theo phân loại */}
      <MaterialFilters values={{ q, status, view, base, tech, finish, pattern, colors, color, tag }} options={options} />

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <BoxesIcon className="size-10" />
          <p>{total === 0 ? 'Chưa có chất liệu nào. Bấm "Thêm chất liệu" hoặc nhập từ CSV.' : "Không có chất liệu khớp bộ lọc."}</p>
        </div>
      ) : (
        <MaterialsBoard key={`${q}|${status}|${view}|${page}|${base}|${tech}|${finish}|${pattern}|${colors}|${color}|${tag}`} items={items} view={view} />
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
