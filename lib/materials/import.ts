import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { parseMaterialsCsv } from "@/lib/csv/materials";
import { db } from "@/lib/db";
import { saveMaterialStock } from "@/lib/quoting/store";
import { countStockChanges, planMaterialsImport, summarizePlan, type ExistingMaterial, type ImportMode, type PlanItem, type PlanSummary, type StockPlan } from "./import-plan";
import { loadOptions } from "./options";
import { decimalToNumber } from "./stock";

export type ImportReport = {
  dryRun: boolean;
  mode: ImportMode;
  summary: PlanSummary;
  /** số dòng (thêm mới hoặc cập nhật) có đổi thông số tấm; được ghi qua saveMaterialStock nên có lịch sử thay đổi */
  stockChanged: number;
  errors: { line: number; message: string }[];
  /** các dòng có thay đổi (tối đa 60) để người dùng xem trước */
  preview: { line: number; code: string; kind: "create" | "update" | "skip"; detail: string }[];
  columns: string[];
};

export async function loadExistingForImport(): Promise<ExistingMaterial[]> {
  const rows = await db.material.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }], include: { styleTags: { select: { value: true } } } });
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
    stockWidthMm: m.stockWidthMm,
    stockHeightMm: m.stockHeightMm,
    stockPrice: decimalToNumber(m.stockPrice),
    edgeMarginMm: m.edgeMarginMm,
    gapMm: m.gapMm,
    allowRotate: m.allowRotate,
  }));
}

/**
 * Nhập CSV chất liệu. `dryRun` = chỉ kiểm tra và báo trước, không ghi gì.
 * Phần chất liệu thông thường ghi trong MỘT giao dịch: lỗi giữa chừng thì không dòng nào được ghi.
 * Thông số tấm KHÔNG ghi thẳng: sau giao dịch đó, mỗi chất liệu có đổi thông số tấm được lưu qua saveMaterialStock
 * (giá trị đã gộp với giá trị hiện có) để lịch sử thay đổi và phiên bản thông số được ghi đúng. Mỗi lần lưu là một giao dịch riêng;
 * chất liệu nào lưu tấm lỗi thì báo ở danh sách lỗi (chất liệu đã được ghi, chỉ phần thông số tấm chưa đổi).
 */
export async function runMaterialsImport(text: string, mode: ImportMode, dryRun: boolean, userId: string): Promise<ImportReport | { error: string }> {
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
    if (p.kind === "create") {
      const warn = p.warnings.length ? ` (${p.warnings.join(", ")})` : "";
      preview.push({ line: p.line, code: p.code, kind: "create", detail: `thêm mới${warn}${p.stock ? ", kèm thông số tấm" : ""}` });
    } else if (p.kind === "update") preview.push({ line: p.line, code: p.code, kind: "update", detail: `đổi: ${p.changed.join(", ")}` });
    else if (p.kind === "skip") preview.push({ line: p.line, code: p.code, kind: "skip", detail: p.reason });
  }

  const summary = summarizePlan(plan);
  summary.errors += parsed.errors.length;
  const stockChanged = countStockChanges(plan);

  if (!dryRun) {
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    const created: { opIndex: number; item: Extract<PlanItem, { kind: "create" }> }[] = [];
    for (const p of plan) {
      if (p.kind === "create") {
        created.push({ opIndex: ops.length, item: p });
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
    const results = ops.length ? await db.$transaction(ops) : [];

    // thông số tấm: ghi qua saveMaterialStock (lịch sử thay đổi + tăng phiên bản thông số), sau khi chất liệu đã có trong CSDL
    const stockJobs: { line: number; code: string; id: string; stock: StockPlan }[] = [];
    for (const p of plan) if (p.kind === "update" && p.stock) stockJobs.push({ line: p.line, code: p.code, id: p.id, stock: p.stock });
    for (const c of created) {
      if (!c.item.stock) continue;
      const id = (results[c.opIndex] as { id?: string } | undefined)?.id;
      if (id) stockJobs.push({ line: c.item.line, code: c.item.code, id, stock: c.item.stock });
    }
    for (const job of stockJobs) {
      try {
        await saveMaterialStock(job.id, job.stock.input, userId);
      } catch (e) {
        console.error(`runMaterialsImport: không lưu được thông số tấm của ${job.code}:`, e);
        errors.push({ line: job.line, message: `${job.code}: đã ghi chất liệu nhưng chưa lưu được thông số tấm, hãy sửa tay ở trang sửa chất liệu.` });
        summary.errors += 1;
      }
    }
    errors.sort((a, b) => a.line - b.line);
  }

  return { dryRun, mode, summary, stockChanged, errors, preview, columns: parsed.columns };
}
