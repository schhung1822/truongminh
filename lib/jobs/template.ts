import "server-only";
import { db } from "@/lib/db";

export type Template = { id: string; version: number; body: string };

/** Prompt đang dùng (phiên bản mới nhất được bật) của loại catalog hoặc thiết kế. */
export async function getActiveTemplate(kind: "CATALOG" | "DESIGN"): Promise<Template> {
  const t = await db.promptTemplate.findFirst({ where: { kind, isActive: true }, orderBy: { version: "desc" } });
  if (!t) {
    throw new Error(
      `Chưa có prompt ${kind === "CATALOG" ? "catalog" : "thiết kế"} nào đang dùng. Hãy vào Quản trị > Prompt để tạo.`,
    );
  }
  return { id: t.id, version: t.version, body: t.body };
}
