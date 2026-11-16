import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { PromptEditor, type PromptVersion } from "./prompt-editor";

export const metadata: Metadata = { title: "Prompt" };

export default async function PromptsPage() {
  await requireAdmin();
  const rows = await db.promptTemplate.findMany({
    orderBy: [{ kind: "asc" }, { version: "desc" }],
    include: { createdBy: { select: { name: true } } },
  });
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
  const byKind = (kind: "CATALOG" | "DESIGN"): PromptVersion[] =>
    rows
      .filter((r) => r.kind === kind)
      .map((r) => ({
        id: r.id,
        version: r.version,
        body: r.body,
        isActive: r.isActive,
        note: r.note,
        createdAt: fmt.format(r.createdAt),
        author: r.createdBy?.name ?? "Hệ thống",
      }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Prompt</h1>
        <p className="text-muted-foreground">
          Mỗi lần lưu tạo một phiên bản mới và dùng ngay. Mỗi ảnh đã tạo lưu lại nguyên văn prompt và số phiên bản đã dùng.
        </p>
      </div>
      <PromptEditor
        kind="CATALOG"
        title="Prompt catalog"
        description="Dùng cho bước 1: tạo ảnh trang mẫu gồm nhiều chất liệu."
        versions={byKind("CATALOG")}
      />
      <PromptEditor
        kind="DESIGN"
        title="Prompt thiết kế"
        description="Dùng cho bước 2: thiết kế sản phẩm trên chất liệu khách đã chọn."
        versions={byKind("DESIGN")}
      />
    </div>
  );
}
