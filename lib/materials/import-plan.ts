import type { CsvValue, MaterialCsvRow } from "@/lib/csv/materials";
import { normalizeClassification, parseBoolean, type ClassifyPatch } from "./classify";
import type { OptionRow } from "./option-types";
import { parseThickness } from "./thickness";

/**
 * Lập kế hoạch nhập CSV chất liệu (thuần, không đụng CSDL): quyết định mỗi dòng sẽ thêm mới, cập nhật, bỏ qua hay lỗi.
 * Quy tắc: ô trống = giữ nguyên; "[xoa]" = xóa; khớp theo id trước rồi mới theo mã.
 */
export type ExistingMaterial = {
  id: string;
  code: string;
  name: string;
  descHuman: string;
  thicknessMm: number | null;
  isActive: boolean;
  sortOrder: number;
  groupName: string;
  printTech: string;
  baseMaterial: string | null;
  technique: string | null;
  surfaceFinish: string | null;
  surfacePattern: string | null;
  colorCount: string | null;
  frontColorName: string | null;
  frontColorFamily: string | null;
  frontColorConfidence: string | null;
  backColorName: string | null;
  backColorFamily: string | null;
  backColorConfidence: string | null;
  seriesCode: string | null;
  aiVisualNote: string | null;
  photoIssue: string | null;
  classifyConfidence: string | null;
  needsReview: boolean;
  reviewNote: string | null;
  styleTags: string[];
};

export type ImportMode = "create-only" | "upsert";

export type PlanItem =
  | { kind: "create"; line: number; code: string; data: Record<string, string | number | boolean | null>; styleTags: string[]; warnings: string[] }
  | { kind: "update"; line: number; id: string; code: string; data: Record<string, string | number | boolean | null>; styleTags?: string[]; changed: string[] }
  | { kind: "unchanged"; line: number; code: string }
  | { kind: "skip"; line: number; code: string; reason: string }
  | { kind: "error"; line: number; code: string; message: string };

const CODE_BAD = /[/\\]/;

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function planMaterialsImport(
  rows: MaterialCsvRow[],
  existing: ExistingMaterial[],
  options: OptionRow[],
  mode: ImportMode,
  firstNewSortOrder: number,
): PlanItem[] {
  const byId = new Map(existing.map((m) => [m.id, m]));
  const byCode = new Map(existing.map((m) => [m.code.toLowerCase(), m]));
  const claimed = new Map<string, string>(); // mã (chữ thường) -> dòng đã dùng, cho mã mới/đổi mã trong cùng file
  const plan: PlanItem[] = [];
  let nextOrder = firstNewSortOrder;

  for (const row of rows) {
    const v = row.values;
    const line = row.line;
    const label = v.code ?? v.id ?? "";
    const err = (message: string) => plan.push({ kind: "error", line, code: label, message });

    // 1) tìm chất liệu đích
    let target: ExistingMaterial | undefined;
    if (mode === "upsert" && v.id) {
      target = byId.get(v.id);
      if (!target) {
        err(`Không tìm thấy chất liệu có id ${v.id}.`);
        continue;
      }
    } else if (v.code) {
      target = byCode.get(v.code.toLowerCase());
    }
    if (target && mode === "create-only") {
      plan.push({ kind: "skip", line, code: target.code, reason: "mã đã có, không ghi đè" });
      continue;
    }

    // 2) các cột cơ bản
    const data: Record<string, string | number | boolean | null> = {};
    const problems: string[] = [];

    if (v.code !== undefined) {
      if (v.code === null) problems.push("Mã không được xóa.");
      else if (v.code.length > 50) problems.push("Mã tối đa 50 ký tự.");
      else if (CODE_BAD.test(v.code)) problems.push("Mã không được chứa dấu / hoặc \\.");
      else data.code = v.code;
    }
    if (v.name !== undefined) {
      if (v.name === null) problems.push("Tên không được xóa.");
      else if (v.name.length > 100) problems.push("Tên tối đa 100 ký tự.");
      else data.name = v.name;
    }
    if (v.descHuman !== undefined) {
      if (v.descHuman !== null && v.descHuman.length > 2000) problems.push("Mô tả tối đa 2000 ký tự.");
      else data.descHuman = v.descHuman ?? "";
    }
    if (v.thicknessMm !== undefined) {
      const t = v.thicknessMm === null ? null : parseThickness(v.thicknessMm);
      if (t === undefined) problems.push(`Độ dày "${v.thicknessMm}" không phải số (mm).`);
      else data.thicknessMm = t;
    }
    if (v.isActive !== undefined) {
      const b = v.isActive === null ? null : parseBoolean(v.isActive);
      if (b === null) problems.push(`Đang bật: "${v.isActive}" không hợp lệ (TRUE hoặc FALSE).`);
      else data.isActive = b;
    }
    if (v.sortOrder !== undefined) {
      const n = v.sortOrder === null ? 0 : Number(v.sortOrder);
      if (!Number.isInteger(n) || n < 0 || n > 100000) problems.push(`Thứ tự "${v.sortOrder}" không hợp lệ (số nguyên 0 trở lên).`);
      else data.sortOrder = n;
    }

    // 3) phân loại. File cũ chỉ có nhóm / công nghệ in dạng chữ thì đối chiếu với nhãn trong danh mục.
    const patch: ClassifyPatch = {
      baseMaterial: v.baseMaterial !== undefined ? v.baseMaterial : (v.groupName ?? undefined),
      technique: v.technique !== undefined ? v.technique : (v.printTech ?? undefined),
      surfaceFinish: v.surfaceFinish,
      surfacePattern: v.surfacePattern,
      colorCount: v.colorCount,
      frontColorName: v.frontColorName,
      frontColorFamily: v.frontColorFamily,
      frontColorConfidence: v.frontColorConfidence,
      backColorName: v.backColorName,
      backColorFamily: v.backColorFamily,
      backColorConfidence: v.backColorConfidence,
      seriesCode: v.seriesCode,
      aiVisualNote: v.aiVisualNote,
      classifyConfidence: v.confidence,
      reviewNote: v.reviewNote,
      needsReview: v.needsReview,
      styleTags: v.styleTags,
      photoIssue: v.photoIssue,
    };
    const cls = normalizeClassification(patch, options, target ? { ...target } : {});
    problems.push(...cls.errors);
    Object.assign(data, cls.scalar);

    if (problems.length) {
      err(problems.join(" "));
      continue;
    }

    // 4) mã không được trùng với chất liệu khác hoặc dòng khác trong file
    const newCode = typeof data.code === "string" ? data.code : undefined;
    if (newCode) {
      const other = byCode.get(newCode.toLowerCase());
      const claimedBy = claimed.get(newCode.toLowerCase());
      if ((other && other.id !== target?.id) || (claimedBy && claimedBy !== String(line))) {
        err(`Mã ${newCode} đã được chất liệu khác dùng.`);
        continue;
      }
    }

    if (!target) {
      // thêm mới
      if (!v.code) {
        err("Thêm mới cần có mã chất liệu.");
        continue;
      }
      if (typeof data.name !== "string" || !data.name) {
        err(`Chất liệu ${v.code}: thiếu tên.`);
        continue;
      }
      const warnings: string[] = [];
      if (typeof data.groupName !== "string") {
        data.groupName = "Chưa phân nhóm";
        data.needsReview = true;
        warnings.push("chưa chọn nhóm chất liệu");
      }
      if (typeof data.printTech !== "string") {
        data.printTech = "Chưa rõ";
        data.needsReview = true;
        warnings.push("chưa chọn công nghệ in");
      }
      if (warnings.length && data.reviewNote == null) data.reviewNote = `Mới nhập từ CSV: ${warnings.join(", ")}.`;
      if (typeof data.descHuman !== "string") data.descHuman = ""; // cột bắt buộc ở CSDL
      data.sortOrder = typeof data.sortOrder === "number" ? data.sortOrder : nextOrder++;
      claimed.set(v.code.toLowerCase(), String(line));
      plan.push({ kind: "create", line, code: v.code, data, styleTags: cls.styleTags ?? [], warnings });
      continue;
    }

    // cập nhật: chỉ giữ những cột thật sự đổi. Mã chỉ khác hoa/thường (khớp theo mã) thì không coi là đổi mã.
    if (newCode && newCode.toLowerCase() === target.code.toLowerCase()) delete data.code;
    else if (newCode) claimed.set(newCode.toLowerCase(), String(line));
    const changed: string[] = [];
    const delta: typeof data = {};
    for (const [k, val] of Object.entries(data)) {
      const cur = (target as unknown as Record<string, unknown>)[k] ?? null;
      if (cur !== val && !(cur === "" && val === null)) {
        delta[k] = val;
        changed.push(k);
      }
    }
    const tagsChanged = cls.styleTags !== undefined && !sameSet(cls.styleTags, target.styleTags);
    if (tagsChanged) changed.push("styleTags");
    if (changed.length === 0) {
      plan.push({ kind: "unchanged", line, code: target.code });
      continue;
    }
    plan.push({ kind: "update", line, id: target.id, code: target.code, data: delta, styleTags: tagsChanged ? cls.styleTags : undefined, changed });
  }
  return plan;
}

export type PlanSummary = { created: number; updated: number; unchanged: number; skipped: number; errors: number };

export function summarizePlan(plan: PlanItem[]): PlanSummary {
  const s: PlanSummary = { created: 0, updated: 0, unchanged: 0, skipped: 0, errors: 0 };
  for (const p of plan) {
    if (p.kind === "create") s.created++;
    else if (p.kind === "update") s.updated++;
    else if (p.kind === "unchanged") s.unchanged++;
    else if (p.kind === "skip") s.skipped++;
    else s.errors++;
  }
  return s;
}

export type { CsvValue };
