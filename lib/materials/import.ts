import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { parseMaterialsCsv } from "@/lib/csv/materials";
import { db } from "@/lib/db";
import { planMaterialsImport, summarizePlan, type ExistingMaterial, type ImportMode, type PlanItem, type PlanSummary } from "./import-plan";
import { loadOptions } from "./options";

export type ImportReport = {
  dryRun: boolean;
  mode: ImportMode;
  summary: PlanSummary;
  errors: { line: number; message: string }[];
  /** các dòng có thay đổi (tối đa 60) để người dùng xem trước */
  preview: { line: number; code: string; kind: "create" | "update" | "skip"; detail: string }[];
  columns: string[];
};

export async function loadExistingForImport(): Promise<ExistingMaterial[]> {
  const rows = await db.material.findMany({ include: { styleTags: { select: { value: true } } } });
  return rows.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    descHuman: m.descHuman,
    thicknessMm: m.thicknessMm,
    isActive: m.isActive,
    sortOrder: m.sortOrder,
    groupName: m.groupName,
    printTech: m.printTech,
    baseMaterial: m.baseMaterial,
    technique: m.technique,
    surfaceFinish: m.surfaceFinish,
    surfacePattern: m.surfacePattern,
    colorCount: m.colorCount,
    frontColorName: m.frontColorName,
    frontColorFamily: m.frontColorFamily,
    frontColorConfidence: m.frontColorConfidence,
    backColorName: m.backColorName,
    backColorFamily: m.backColorFamily,
    backColorConfidence: m.backColorConfidence,
    seriesCode: m.seriesCode,
    aiVisualNote: m.aiVisualNote,
    photoIssue: m.photoIssue,
    classifyConfidence: m.classifyConfidence,
    needsReview: m.needsReview,
    reviewNote: m.reviewNote,
    styleTags: m.styleTags.map((t) => t.value),
  }));
}

/**
 * Nhập CSV chất liệu. `dryRun` = chỉ kiểm tra và báo trước, không ghi gì.
 * Mọi thay đổi ghi trong MỘT giao dịch: lỗi giữa chừng thì không dòng nào được ghi.
 */
export async function runMaterialsImport(text: string, mode: ImportMode, dryRun: boolean): Promise<ImportReport | { error: string }> {
  const parsed = parseMaterialsCsv(text);
  if (parsed.rows.length === 0) return { error: parsed.errors[0]?.message ?? "Không có dòng hợp lệ nào để nhập." };

  const [existing, options, max] = await Promise.all([loadExistingForImport(), loadOptions(), db.material.aggregate({ _max: { sortOrder: true } })]);
  const plan = planMaterialsImport(parsed.rows, existing, options, mode, (max._max.sortOrder ?? 0) + 1);

  const errors = [
    ...parsed.errors,
    ...plan.filter((p): p is Extract<PlanItem, { kind: "error" }> => p.kind === "error").map((p) => ({ line: p.line, message: `${p.code}: ${p.message}` })),
  ].sort((a, b) => a.line - b.line);

  const preview: ImportReport["preview"] = [];
  for (const p of plan) {
    if (preview.length >= 60) break;
    if (p.kind === "create") preview.push({ line: p.line, code: p.code, kind: "create", detail: p.warnings.length ? `thêm mới (${p.warnings.join(", ")})` : "thêm mới" });
    else if (p.kind === "update") preview.push({ line: p.line, code: p.code, kind: "update", detail: `đổi: ${p.changed.join(", ")}` });
    else if (p.kind === "skip") preview.push({ line: p.line, code: p.code, kind: "skip", detail: p.reason });
  }

  const summary = summarizePlan(plan);
  summary.errors += parsed.errors.length;

  if (!dryRun) {
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const p of plan) {
      if (p.kind === "create") {
        ops.push(
          db.material.create({
            data: { ...(p.data as unknown as Prisma.MaterialUncheckedCreateInput), styleTags: { create: p.styleTags.map((value) => ({ value })) } },
          }),
        );
      } else if (p.kind === "update") {
        if (Object.keys(p.data).length) ops.push(db.material.update({ where: { id: p.id }, data: p.data as unknown as Prisma.MaterialUncheckedUpdateInput }));
        if (p.styleTags) {
          ops.push(db.materialStyleTag.deleteMany({ where: { materialId: p.id } }));
          if (p.styleTags.length) ops.push(db.materialStyleTag.createMany({ data: p.styleTags.map((value) => ({ materialId: p.id, value })) }));
        }
      }
    }
    if (ops.length) await db.$transaction(ops);
  }

  return { dryRun, mode, summary, errors, preview, columns: parsed.columns };
}
