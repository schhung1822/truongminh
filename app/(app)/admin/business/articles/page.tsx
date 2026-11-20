import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon, PencilIcon, PlusIcon, SearchIcon } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getAllBudgets, getKnowledgeForAI } from "@/lib/knowledge";
import { AI_ROLES, CATEGORIES, categoryInfo, isAiRole, isCategory, isVisibility, ROLE_INFO, VISIBILITIES, VISIBILITY_LABEL, type AiRole } from "@/lib/knowledge/roles";
import { deleteArticleAction } from "../actions";
import { fold, parseTagsJson, ROLE_SHORT, STATUS_LABEL, STATUSES } from "../article-schema";
import { ConfirmDeleteButton } from "../confirm-button";
import { StatusBadge, VisibilityBadge } from "../visibility-badge";
import { BudgetCard, type BudgetItem } from "./budget-card";
import { ImportDialog } from "./import-dialog";

export const metadata: Metadata = { title: "Bài kiến thức" };

const PAGE_SIZE = 50;
const FETCH_CAP = 2000;

// địa chỉ API tải file (khai báo bằng biến vì đây là tải về, không phải chuyển trang)
const EXPORT_HREF = "/api/business/articles/export";

type Params = { q?: string; category?: string; visibility?: string; status?: string; role?: string; page?: string };

function href(current: Params, change: Params): string {
  const merged = { ...current, ...change };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v && !(k === "page" && v === "1")) sp.set(k, v);
  const s = sp.toString();
  return `/admin/business/articles${s ? `?${s}` : ""}`;
}

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 200);
  const category = isCategory(params.category) ? params.category : "";
  const visibility = isVisibility(params.visibility) ? params.visibility : "";
  const status = (STATUSES as readonly string[]).includes(params.status ?? "") ? (params.status as (typeof STATUSES)[number]) : "";
  const role = isAiRole(params.role) ? params.role : "";
  const page = Math.max(1, Number(params.page) || 1);
  const current: Params = { q, category, visibility, status, role };

  const where: Prisma.KnowledgeArticleWhereInput = {
    ...(category ? { category } : {}),
    ...(visibility ? { visibility } : {}),
    ...(status ? { status } : {}),
    ...(role ? { roles: { some: { role } } } : {}),
  };

  const [all, total, budgets, knowledge] = await Promise.all([
    db.knowledgeArticle.findMany({ where, orderBy: { updatedAt: "desc" }, take: FETCH_CAP, include: { roles: { select: { role: true } } } }),
    db.knowledgeArticle.count(),
    getAllBudgets(),
    Promise.all(AI_ROLES.map((r) => getKnowledgeForAI({ role: r }))),
  ]);

  // tìm theo tiêu đề, nội dung, tag; không phân biệt hoa thường và dấu
  const needle = fold(q);
  const matched = needle
    ? all.filter((a) => fold(a.title).includes(needle) || fold(a.body).includes(needle) || parseTagsJson(a.tags).some((t) => fold(t).includes(needle)))
    : all;
  const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const pageNo = Math.min(page, pages);
  const rows = matched.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE);

  const editorIds = [...new Set(rows.map((a) => a.updatedById).filter((x): x is string => !!x))];
  const editors = editorIds.length ? await db.user.findMany({ where: { id: { in: editorIds } }, select: { id: true, name: true } }) : [];
  const editorName = new Map(editors.map((u) => [u.id, u.name]));
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

  const budgetItems: BudgetItem[] = AI_ROLES.map((r, i) => ({
    role: r,
    label: ROLE_INFO[r].label,
    desc: ROLE_INFO[r].desc,
    budget: budgets[r],
    defaultBudget: ROLE_INFO[r].budgetChars,
    used: knowledge[i].text.length,
    usedCount: knowledge[i].usedIds.length,
    droppedCount: knowledge[i].droppedIds.length,
  }));

  const hasFilter = !!(q || category || visibility || status || role);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Mỗi bài có mức hiển thị và các vai AI được dùng. Chỉ bài <b>Đang dùng</b> mới được AI đọc. Bài <b>Chỉ admin</b> không AI nào đọc.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={EXPORT_HREF} className={buttonVariants({ variant: "outline", className: "h-10" })}>
            <DownloadIcon /> Xuất CSV
          </a>
          <ImportDialog />
          <Link href="/admin/business/articles/new" className={buttonVariants({ className: "h-10" })}>
            <PlusIcon /> Thêm bài
          </Link>
        </div>
      </div>

      <BudgetCard items={budgetItems} />

      <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_12rem_9rem_9rem_12rem_auto]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Tìm tiêu đề, nội dung, tag" className="h-10 pl-9" aria-label="Tìm bài" />
        </div>
        <NativeSelect name="category" defaultValue={category} aria-label="Danh mục">
          <option value="">Mọi danh mục</option>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="visibility" defaultValue={visibility} aria-label="Mức hiển thị">
          <option value="">Mọi mức</option>
          {VISIBILITIES.map((v) => (
            <option key={v} value={v}>
              {VISIBILITY_LABEL[v]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={status} aria-label="Trạng thái">
          <option value="">Mọi trạng thái</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="role" defaultValue={role} aria-label="Vai AI">
          <option value="">Mọi vai AI</option>
          {AI_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_SHORT[r]}
            </option>
          ))}
        </NativeSelect>
        <div className="flex gap-2">
          <Button type="submit" className="h-10">
            Lọc
          </Button>
          {hasFilter && (
            <Link href="/admin/business/articles" className={buttonVariants({ variant: "ghost", className: "h-10" })}>
              Xóa lọc
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <p>{total === 0 ? 'Chưa có dữ liệu. Bấm "Thêm bài" hoặc nhập từ CSV để bắt đầu.' : "Không có bài nào khớp bộ lọc."}</p>
        </div>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Tiêu đề</TableHead>
                  <TableHead>Danh mục</TableHead>
                  <TableHead>Mức</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Vai AI</TableHead>
                  <TableHead>Sửa lần cuối</TableHead>
                  <TableHead className="pr-4 text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => {
                  const roles = a.roles.map((r) => r.role).filter(isAiRole) as AiRole[];
                  const tags = parseTagsJson(a.tags);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="max-w-80 py-2 pl-4 whitespace-normal">
                        <Link href={`/admin/business/articles/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                          {a.title}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                          {a.alwaysInclude && <Badge variant="outline">Luôn kèm</Badge>}
                          {a.priority !== 0 && <span>Ưu tiên {a.priority}</span>}
                          {tags.slice(0, 4).map((t) => (
                            <span key={t} className="rounded bg-muted px-1.5 py-0.5">
                              {t}
                            </span>
                          ))}
                          {tags.length > 4 && <span>+{tags.length - 4}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">{categoryInfo(a.category).label}</TableCell>
                      <TableCell>
                        <VisibilityBadge visibility={a.visibility} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={a.status} />
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">{a.visibility === "ADMIN_ONLY" ? "Không AI nào" : "Chưa gán vai"}</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {roles.map((r) => (
                              <Badge key={r} variant="outline">
                                {ROLE_SHORT[r]}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmt.format(a.updatedAt)}
                        {a.updatedById && <div>{editorName.get(a.updatedById) ?? "Tài khoản đã xóa"}</div>}
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex justify-end gap-2">
                          <Link href={`/admin/business/articles/${a.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                            <PencilIcon /> Sửa
                          </Link>
                          <ConfirmDeleteButton
                            action={deleteArticleAction.bind(null, a.id)}
                            title="Xóa bài kiến thức này?"
                            description={`Bài "${a.title}" sẽ bị xóa hẳn và AI không còn đọc được. Muốn giữ lại thì chuyển sang trạng thái Ngừng thay vì xóa.`}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {matched.length.toLocaleString("vi-VN")} bài{hasFilter ? ` khớp (tổng ${total.toLocaleString("vi-VN")})` : ""}
          {all.length >= FETCH_CAP && ` — chỉ xét ${FETCH_CAP} bài sửa gần nhất, hãy thu hẹp bộ lọc`}
        </span>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            {pageNo > 1 && (
              <Link href={href(current, { page: String(pageNo - 1) })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Trang trước
              </Link>
            )}
            <span>
              Trang {pageNo}/{pages}
            </span>
            {pageNo < pages && (
              <Link href={href(current, { page: String(pageNo + 1) })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Trang sau
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
