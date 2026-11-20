import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { categoryInfo, isCategory } from "@/lib/knowledge/roles";
import { MAX_TITLE } from "../../article-schema";
import { ArticleForm } from "../article-form";

export const metadata: Metadata = { title: "Thêm bài kiến thức" };

/** Tiêu đề điền sẵn qua ?title= (từ trang "Câu hỏi chưa trả lời"), danh mục qua ?category=. Mặc định: Nội bộ, Nháp. */
export default async function NewArticlePage({ searchParams }: { searchParams: Promise<{ title?: string; category?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const title = (sp.title ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
  const category = isCategory(sp.category) ? sp.category : "khac";
  const info = categoryInfo(category);

  return (
    <ArticleForm
      initial={{
        id: null,
        title,
        category,
        body: "",
        visibility: category === "khac" ? "INTERNAL" : info.visibility,
        roles: info.roles,
        tags: "",
        status: "DRAFT",
        priority: 0,
        alwaysInclude: false,
        effectiveFrom: "",
        lastEdit: null,
      }}
    />
  );
}
