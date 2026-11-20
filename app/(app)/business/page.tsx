import type { Metadata } from "next";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { fold, parseTagsJson } from "@/app/(app)/admin/business/article-schema";
import { VisibilityBadge } from "@/app/(app)/admin/business/visibility-badge";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getBusinessProfile } from "@/lib/knowledge";
import { CATEGORIES, categoryInfo, isCategory, isVisibility, PROFILE_FIELDS } from "@/lib/knowledge/roles";

export const metadata: Metadata = { title: "Kiến thức xưởng" };

const LIMIT = 300;

/**
 * Trang chỉ đọc cho nhân viên (và admin): hồ sơ xưởng và các bài kiến thức ĐANG DÙNG mức Công khai/Nội bộ.
 * Việc lọc nằm ngay trong câu truy vấn: bài Chỉ admin, bài Nháp/Ngừng, trường hồ sơ Chỉ admin, thông số giá và nhật ký
 * không bao giờ được tải lên, nên không thể lọt xuống trình duyệt.
 */
export default async function BusinessKnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  await requireUser(); // mọi tài khoản đăng nhập (SALE hoặc ADMIN) xem được; không có thao tác ghi nào ở trang này
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 200);
  const category = isCategory(sp.category) ? sp.category : "";
  const now = new Date();

  const [profile, rows] = await Promise.all([
    getBusinessProfile(),
    db.knowledgeArticle.findMany({
      where: {
        status: "ACTIVE",
        visibility: { in: ["PUBLIC", "INTERNAL"] },
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }],
        ...(category ? { category } : {}),
      },
      orderBy: [{ priority: "desc" }, { title: "asc" }],
      take: LIMIT,
      select: { id: true, title: true, category: true, body: true, visibility: true, tags: true, updatedAt: true },
    }),
  ]);

  // hồ sơ: chỉ trường Công khai/Nội bộ và có nội dung; thiếu mức = Nội bộ
  const raw = profile.visibility && typeof profile.visibility === "object" ? (profile.visibility as Record<string, unknown>) : {};
  const profileRows = PROFILE_FIELDS.flatMap((f) => {
    const value = profile.fields[f.key]?.trim();
    const level = isVisibility(raw[f.key]) ? raw[f.key] : "INTERNAL";
    return value && level !== "ADMIN_ONLY" ? [{ key: f.key, label: f.label, value, level: level as string }] : [];
  });

  const needle = fold(q);
  const articles = needle
    ? rows.filter((a) => fold(a.title).includes(needle) || fold(a.body).includes(needle) || parseTagsJson(a.tags).some((t) => fold(t).includes(needle)))
    : rows;
  const groups = CATEGORIES.map((c) => ({ info: c, items: articles.filter((a) => categoryInfo(a.category).key === c.key) })).filter((g) => g.items.length > 0);
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
  const hasFilter = !!(q || category);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Kiến thức xưởng</h1>
        <p className="text-muted-foreground">
          Thông tin về xưởng để tư vấn khách cho đúng. Mục <b>Công khai</b> được nói thẳng với khách; mục <b>Nội bộ</b> chỉ để bạn hiểu và tư vấn, đừng gửi nguyên văn cho khách.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{profile.workshopName}</CardTitle>
          <CardDescription>Hồ sơ xưởng{profile.updatedAt ? `, cập nhật ${fmt.format(profile.updatedAt)}` : ""}.</CardDescription>
        </CardHeader>
        <CardContent>
          {profileRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
          ) : (
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {profileRows.map((r) => (
                <div key={r.key} className="flex flex-col gap-0.5">
                  <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                    {r.label} <VisibilityBadge visibility={r.level} />
                  </dt>
                  <dd className="text-sm whitespace-pre-wrap">{r.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      <form method="get" className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1 sm:max-w-md">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Tìm trong kiến thức xưởng" className="h-10 pl-9" aria-label="Tìm bài kiến thức" />
        </div>
        <NativeSelect name="category" defaultValue={category} aria-label="Danh mục" className="sm:w-64">
          <option value="">Mọi danh mục</option>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" className="h-10">
          Tìm
        </Button>
        {hasFilter && (
          <Link href="/business" className={buttonVariants({ variant: "ghost", className: "h-10" })}>
            Xóa lọc
          </Link>
        )}
      </form>

      {articles.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          {rows.length === 0 && !hasFilter ? "Chưa có dữ liệu. Quản trị viên chưa đưa bài kiến thức nào vào sử dụng." : "Không có bài nào khớp."}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.info.key} className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">
                {g.info.label} <span className="text-sm font-normal text-muted-foreground">({g.items.length})</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {g.items.map((a) => {
                  const tags = parseTagsJson(a.tags);
                  return (
                    <li key={a.id}>
                      <details className="group rounded-lg border bg-card" open={!!needle && articles.length <= 5}>
                        <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm font-medium marker:content-none">
                          <span className="min-w-0 flex-1">{a.title}</span>
                          <VisibilityBadge visibility={a.visibility} />
                        </summary>
                        <div className="flex flex-col gap-2 border-t px-4 py-3">
                          <p className="text-sm whitespace-pre-wrap">{a.body}</p>
                          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            Cập nhật {fmt.format(a.updatedAt)}
                            {tags.map((t) => (
                              <span key={t} className="rounded bg-muted px-1.5 py-0.5">
                                {t}
                              </span>
                            ))}
                          </p>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {rows.length >= LIMIT && <p className="text-xs text-muted-foreground">Chỉ hiện {LIMIT} bài đầu, hãy tìm hoặc lọc theo danh mục để thu hẹp.</p>}
        </div>
      )}
    </div>
  );
}
