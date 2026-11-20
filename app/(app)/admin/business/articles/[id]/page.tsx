import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { isAiRole, isCategory, isVisibility } from "@/lib/knowledge/roles";
import { formatEffectiveFrom, parseTagsJson, STATUSES, type ArticleStatus } from "../../article-schema";
import { ArticleForm } from "../article-form";

export const metadata: Metadata = { title: "Sửa bài kiến thức" };

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const a = await db.knowledgeArticle.findUnique({ where: { id }, include: { roles: { select: { role: true } } } });
  if (!a) notFound();
  const editor = a.updatedById ? await db.user.findUnique({ where: { id: a.updatedById }, select: { name: true } }) : null;
  const when = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(a.updatedAt);

  return (
    <ArticleForm
      key={`${a.id}-${a.updatedAt.getTime()}`}
      initial={{
        id: a.id,
        title: a.title,
        category: isCategory(a.category) ? a.category : "khac",
        body: a.body,
        visibility: isVisibility(a.visibility) ? a.visibility : "INTERNAL",
        roles: a.roles.map((r) => r.role).filter(isAiRole),
        tags: parseTagsJson(a.tags).join(", "),
        status: (STATUSES as readonly string[]).includes(a.status) ? (a.status as ArticleStatus) : "DRAFT",
        priority: a.priority,
        alwaysInclude: a.alwaysInclude,
        effectiveFrom: formatEffectiveFrom(a.effectiveFrom) ?? "",
        lastEdit: `${editor?.name ?? (a.updatedById ? "tài khoản đã xóa" : "không rõ")}, ${when}`,
      }}
    />
  );
}
