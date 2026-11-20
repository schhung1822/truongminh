import { buildArticlesCsv } from "@/app/(app)/admin/business/articles-csv";
import { parseTagsJson } from "@/app/(app)/admin/business/article-schema";
import { apiUser, isResponse } from "@/lib/api";
import { db } from "@/lib/db";
import { todayKey } from "@/lib/jobs/limits";

/** Tải CSV toàn bộ bài kiến thức (chỉ admin, kể cả bài Chỉ admin và bài Nháp). Cùng định dạng với nút Nhập CSV. */
export async function GET() {
  const user = await apiUser({ admin: true });
  if (isResponse(user)) return user;
  const rows = await db.knowledgeArticle.findMany({
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    include: { roles: { select: { role: true } } },
  });
  const csv = buildArticlesCsv(
    rows.map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      visibility: a.visibility,
      status: a.status,
      roles: a.roles.map((r) => r.role).sort(),
      tags: parseTagsJson(a.tags),
      priority: a.priority,
      alwaysInclude: a.alwaysInclude,
      effectiveFrom: a.effectiveFrom,
      body: a.body,
    })),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kien-thuc-${todayKey()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
