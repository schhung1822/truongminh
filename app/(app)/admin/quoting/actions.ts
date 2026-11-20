"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { MIN_SAMPLES } from "@/lib/quoting/calibration";
import { machineProfileSchema, materialStockSchema } from "@/lib/quoting/schemas";
import {
  addMachineTimeLog,
  calibrationFor,
  deleteMachineTimeLog,
  materialStockOf,
  saveMachineProfile,
  saveMaterialStock,
  saveQuoteSettings,
  timeLogDefaultsFromQuote,
} from "@/lib/quoting/store";
import { MAX_BULK_ROWS, parsePriceSpec, parseStockPatch, previewPriceChange, previewStockPatch, type PriceSpecText, type StockPatchText } from "./bulk";
import { defaultsToRaw, timeRawToInput, type TimeRaw } from "./time-form";
import { CALIBRATION_LABEL, isCalibrationKey, mergeCalibration, roundSuggestion, type CalibrationKey } from "./calibration-form";
import { parseGrouped } from "./parse";
import { machineRawToInput, MACHINE_FIELDS, type MachineRaw } from "./machine-form";
import { settingsRawToInput, type SettingsRaw } from "./settings-input";
import { stockRawToInput, type StockRaw } from "./stock-form";

/**
 * Server Action của trang thiết lập báo giá. Mọi action: requireAdmin() ở đầu, dữ liệu từ trình duyệt coi như chưa tin được
 * (đọc lại thành chữ, kiểm tra bằng zod của lib/quoting), ghi qua các hàm của store (có lịch sử thay đổi), rồi revalidate.
 */

export type ActionResult = { error?: string; ok?: string };

function refresh() {
  revalidatePath("/admin/quoting", "layout");
  revalidatePath("/quote", "layout");
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function fail(e: unknown, what: string): { error: string } {
  console.error(`${what}:`, e instanceof Error ? e.message : e);
  return { error: `${what}: không ghi được vào cơ sở dữ liệu. Thử lại sau.` };
}

/* ---------- Tấm vật liệu: một dòng ---------- */

function coerceStockRaw(v: unknown): StockRaw {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { widthCm: str(o.widthCm), heightCm: str(o.heightCm), price: str(o.price), edgeMarginMm: str(o.edgeMarginMm), gapMm: str(o.gapMm), allowRotate: o.allowRotate === true };
}

export async function saveMaterialStockAction(materialId: string, raw: StockRaw): Promise<ActionResult> {
  const user = await requireAdmin();
  const id = str(materialId);
  if (!id || id.length > 40) return { error: "Chất liệu không hợp lệ." };
  const r = stockRawToInput(coerceStockRaw(raw));
  if ("error" in r) return { error: r.error };
  try {
    const { changed } = await saveMaterialStock(id, r.input, user.id);
    if (!changed) return { ok: "Không có gì thay đổi." };
    refresh();
    return { ok: "Đã lưu." };
  } catch (e) {
    if (e instanceof Error && e.message === "Không tìm thấy chất liệu.") return { error: e.message };
    return fail(e, "Lưu tấm vật liệu");
  }
}

/* ---------- Tấm vật liệu: đổi hàng loạt ---------- */

export type BulkReport = {
  changed: number;
  same: number;
  skipped: { code: string; reason: string }[];
  failed: { code: string; reason: string }[];
};
export type BulkResult = ActionResult & { report?: BulkReport };

function cleanIds(v: unknown): { ok: true; list: string[] } | { error: string } {
  if (!Array.isArray(v)) return { error: "Chưa chọn chất liệu nào." };
  const list = [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 40))];
  if (list.length === 0) return { error: "Chưa chọn chất liệu nào." };
  if (list.length > MAX_BULK_ROWS) return { error: `Mỗi lần chỉ đổi tối đa ${MAX_BULK_ROWS} chất liệu. Đang chọn ${list.length}.` };
  return { ok: true, list };
}

const REPORT_LIMIT = 100;

function summarize(verb: string, rep: BulkReport): BulkResult {
  const parts = [`${verb} ${rep.changed} chất liệu`];
  if (rep.same > 0) parts.push(`${rep.same} dòng không đổi`);
  if (rep.skipped.length > 0) parts.push(`${rep.skipped.length} dòng bỏ qua`);
  if (rep.failed.length > 0) parts.push(`${rep.failed.length} dòng lỗi`);
  const text = `${parts.join(", ")}.`;
  return rep.failed.length > 0 && rep.changed === 0 ? { error: text, report: rep } : { ok: text, report: rep };
}

async function loadMaterials(ids: string[]) {
  const mats = await db.material.findMany({
    where: { id: { in: ids } },
    select: { id: true, code: true, name: true, technique: true, stockWidthMm: true, stockHeightMm: true, stockPrice: true, edgeMarginMm: true, gapMm: true, allowRotate: true },
  });
  const byId = new Map(mats.map((m) => [m.id, m]));
  return { byId, ordered: ids.map((id) => byId.get(id)).filter((m): m is NonNullable<typeof m> => !!m), missingIds: ids.filter((id) => !byId.has(id)) };
}

/** Đổi giá tấm cho nhiều chất liệu: mỗi dòng lưu riêng bằng saveMaterialStock (có lịch sử từng chất liệu). Tính lại trên dữ liệu thật, không tin số xem trước. */
export async function applyBulkPriceAction(input: { ids: string[]; spec: PriceSpecText }): Promise<BulkResult> {
  const user = await requireAdmin();
  const ids = cleanIds(input?.ids);
  if ("error" in ids) return ids;
  const parsed = parsePriceSpec({ mode: input?.spec?.mode, value: str(input?.spec?.value), roundTo: str(input?.spec?.roundTo) });
  if ("error" in parsed) return { error: parsed.error };

  const { byId, ordered, missingIds } = await loadMaterials(ids.list);
  const previews = previewPriceChange(
    ordered.map((m) => ({ id: m.id, code: m.code, name: m.name, stockPrice: materialStockOf(m).stockPrice })),
    parsed.spec,
  );

  const rep: BulkReport = { changed: 0, same: 0, skipped: missingIds.map((id) => ({ code: id, reason: "Không tìm thấy chất liệu." })), failed: [] };
  for (const p of previews) {
    if (p.status === "skip" || p.status === "error") {
      rep.skipped.push({ code: p.code, reason: p.reason ?? "Bỏ qua." });
      continue;
    }
    if (p.status === "same") {
      rep.same++;
      continue;
    }
    const s = materialStockOf(byId.get(p.id)!);
    const v = materialStockSchema.safeParse({ stockWidthMm: s.stockWidthMm, stockHeightMm: s.stockHeightMm, stockPrice: p.newPrice, edgeMarginMm: s.edgeMarginMm, gapMm: s.gapMm, allowRotate: s.allowRotate });
    if (!v.success) {
      rep.failed.push({ code: p.code, reason: v.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." });
      continue;
    }
    try {
      const r = await saveMaterialStock(p.id, v.data, user.id);
      if (r.changed) rep.changed++;
      else rep.same++;
    } catch (e) {
      console.error("Đổi giá hàng loạt, lỗi ở", p.code, e instanceof Error ? e.message : e);
      rep.failed.push({ code: p.code, reason: "Không ghi được vào cơ sở dữ liệu." });
    }
  }
  rep.skipped = rep.skipped.slice(0, REPORT_LIMIT);
  rep.failed = rep.failed.slice(0, REPORT_LIMIT);
  if (rep.changed > 0) refresh();
  return summarize("Đã đổi giá", rep);
}

/** Áp dụng cùng kích thước tấm / lề / khoảng cách cho nhiều chất liệu. Ô để trống = giữ nguyên giá trị của từng dòng. */
export async function applyBulkStockAction(input: { ids: string[]; patch: StockPatchText }): Promise<BulkResult> {
  const user = await requireAdmin();
  const ids = cleanIds(input?.ids);
  if ("error" in ids) return ids;
  const p = input?.patch;
  const parsed = parseStockPatch({ widthCm: str(p?.widthCm), heightCm: str(p?.heightCm), edgeMarginMm: str(p?.edgeMarginMm), gapMm: str(p?.gapMm), clearGap: p?.clearGap === true });
  if ("error" in parsed) return { error: parsed.error };

  const { byId, ordered, missingIds } = await loadMaterials(ids.list);
  const previews = previewStockPatch(
    ordered.map((m) => {
      const s = materialStockOf(m);
      return { id: m.id, code: m.code, name: m.name, stockWidthMm: s.stockWidthMm, stockHeightMm: s.stockHeightMm, edgeMarginMm: s.edgeMarginMm, gapMm: s.gapMm };
    }),
    parsed.patch,
  );

  const rep: BulkReport = { changed: 0, same: 0, skipped: missingIds.map((id) => ({ code: id, reason: "Không tìm thấy chất liệu." })), failed: [] };
  for (const pv of previews) {
    if (pv.changed.length === 0) {
      rep.same++;
      continue;
    }
    const s = materialStockOf(byId.get(pv.id)!);
    const v = materialStockSchema.safeParse({
      stockWidthMm: pv.after.stockWidthMm,
      stockHeightMm: pv.after.stockHeightMm,
      stockPrice: s.stockPrice,
      edgeMarginMm: pv.after.edgeMarginMm,
      gapMm: pv.after.gapMm,
      allowRotate: s.allowRotate,
    });
    if (!v.success) {
      rep.failed.push({ code: pv.code, reason: v.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." });
      continue;
    }
    try {
      const r = await saveMaterialStock(pv.id, v.data, user.id);
      if (r.changed) rep.changed++;
      else rep.same++;
    } catch (e) {
      console.error("Áp dụng kích thước hàng loạt, lỗi ở", pv.code, e instanceof Error ? e.message : e);
      rep.failed.push({ code: pv.code, reason: "Không ghi được vào cơ sở dữ liệu." });
    }
  }
  rep.failed = rep.failed.slice(0, REPORT_LIMIT);
  if (rep.changed > 0) refresh();
  return summarize("Đã cập nhật", rep);
}

/* ---------- Thông số máy ---------- */

function cleanTechnique(v: unknown): string | null {
  const t = str(v).trim();
  return t && t.length <= 60 ? t : null;
}

export async function saveMachineProfileAction(technique: string, raw: MachineRaw): Promise<ActionResult> {
  const user = await requireAdmin();
  const t = cleanTechnique(technique);
  if (!t) return { error: "Công nghệ không hợp lệ." };
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const r = machineRawToInput(Object.fromEntries(MACHINE_FIELDS.map((f) => [f.key, str(o[f.key])])));
  if ("error" in r) return { error: r.error };
  try {
    const { changed } = await saveMachineProfile(t, r.input, user.id);
    if (!changed) return { ok: "Không có gì thay đổi." };
    refresh();
    return { ok: "Đã lưu thông số máy." };
  } catch (e) {
    return fail(e, "Lưu thông số máy");
  }
}

/* ---------- Cấu hình giá ---------- */

export type SettingsActionResult = ActionResult & { tierErrors?: (string | null)[] };

export async function saveQuoteSettingsAction(raw: SettingsRaw): Promise<SettingsActionResult> {
  const user = await requireAdmin();
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const eng = (o.engrave && typeof o.engrave === "object" ? o.engrave : {}) as Record<string, unknown>;
  const tiersIn = Array.isArray(o.tiers) ? o.tiers.slice(0, 50) : [];
  const policy = str(o.lastSheetPolicy);
  const r = settingsRawToInput({
    defaultGapMm: str(o.defaultGapMm),
    lastSheetPolicy: policy === "WHOLE_SHEET" || policy === "PRO_RATA" ? policy : "",
    roundTo: str(o.roundTo),
    quantities: str(o.quantities),
    engrave: { IT: str(eng.IT), VUA: str(eng.VUA), NHIEU: str(eng.NHIEU) },
    tiers: tiersIn.map((t) => {
      const x = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
      return { fromQty: str(x.fromQty), toQty: str(x.toQty), markupPct: str(x.markupPct) };
    }),
  });
  if ("error" in r) return { error: r.error, tierErrors: r.tierErrors };
  try {
    const { changed } = await saveQuoteSettings(r.input, user.id);
    if (!changed) return { ok: "Không có gì thay đổi." };
    refresh();
    return { ok: "Đã lưu cấu hình giá." };
  } catch (e) {
    return fail(e, "Lưu cấu hình giá");
  }
}

/* ---------- Thời gian máy thực tế ---------- */

export async function addTimeLogAction(raw: TimeRaw): Promise<ActionResult> {
  const user = await requireAdmin();
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const r = timeRawToInput({
    description: str(o.description),
    technique: str(o.technique),
    totalCutMm: str(o.totalCutMm),
    engraveAreaMm2: str(o.engraveAreaMm2),
    sheets: str(o.sheets),
    actualMinutes: str(o.actualMinutes),
    quoteId: str(o.quoteId),
  });
  if ("error" in r) return { error: r.error };
  try {
    await addMachineTimeLog(r.input, user.id);
    refresh();
    return { ok: "Đã ghi thời gian máy của đơn này." };
  } catch (e) {
    return fail(e, "Ghi thời gian máy");
  }
}

export async function deleteTimeLogAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  const logId = str(id);
  if (!logId || logId.length > 40) return { error: "Bản ghi không hợp lệ." };
  try {
    await deleteMachineTimeLog(logId);
    refresh();
    return { ok: "Đã xóa bản ghi." };
  } catch (e) {
    return fail(e, "Xóa bản ghi");
  }
}

export type TimeDefaultsResult = { error: string } | { defaults: Pick<TimeRaw, "technique" | "totalCutMm" | "engraveAreaMm2" | "sheets" | "description"> };

/** "Điền sẵn từ báo giá": nhận mã báo giá và mốc số lượng, trả số liệu để điền vào form (chưa ghi gì). */
export async function timeDefaultsFromQuoteAction(quoteId: string, quantity: string): Promise<TimeDefaultsResult> {
  await requireAdmin();
  const id = str(quoteId).trim();
  if (!id || id.length > 40) return { error: "Vui lòng nhập mã báo giá." };
  const q = parseGrouped(str(quantity));
  if (typeof q !== "number" || !Number.isInteger(q) || q < 1) return { error: "Số lượng phải là số nguyên từ 1." };
  try {
    const r = await timeLogDefaultsFromQuote(id, q);
    if ("error" in r) return { error: r.error };
    return { defaults: defaultsToRaw(r) };
  } catch (e) {
    return fail(e, "Đọc báo giá");
  }
}

/* ---------- Hiệu chỉnh ---------- */

export type CalibrationPick = { key: CalibrationKey; value: number };

/**
 * Áp dụng đề xuất hiệu chỉnh: tính lại trên máy chủ, đối chiếu với số admin đã thấy, chỉ đổi các trường được chọn
 * (gộp vào dòng thông số máy hiện có, giữ nguyên các trường khác) rồi lưu qua saveMachineProfile.
 */
export async function applyCalibrationAction(technique: string, picks: CalibrationPick[]): Promise<ActionResult> {
  const user = await requireAdmin();
  const t = cleanTechnique(technique);
  if (!t) return { error: "Công nghệ không hợp lệ." };
  if (!Array.isArray(picks) || picks.length === 0) return { error: "Chưa chọn thông số nào để áp dụng." };

  const view = await calibrationFor(t);
  if (view.result.n < MIN_SAMPLES) return { error: `Mới có ${view.result.n} đơn, chưa đủ ${MIN_SAMPLES} đơn để áp dụng hiệu chỉnh.` };

  const chosen: Partial<Record<CalibrationKey, number>> = {};
  for (const p of picks) {
    if (!p || !isCalibrationKey(p.key)) return { error: "Thông số không hợp lệ." };
    const suggested = view.result.suggested[p.key];
    if (suggested === null || suggested === undefined) return { error: `${CALIBRATION_LABEL[p.key].label}: chưa có đề xuất để áp dụng.` };
    const now = roundSuggestion(suggested);
    if (typeof p.value !== "number" || Math.abs(now - p.value) > 1e-9 * Math.max(1, Math.abs(now))) {
      return { error: `${CALIBRATION_LABEL[p.key].label}: số đề xuất đã thay đổi từ lúc bạn mở trang (có thêm đơn mới). Hãy tải lại trang rồi xem lại.` };
    }
    chosen[p.key] = now;
  }

  const merged = machineProfileSchema.safeParse(mergeCalibration(view.current, chosen));
  if (!merged.success) return { error: merged.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  try {
    const { changed } = await saveMachineProfile(t, merged.data, user.id);
    refresh();
    return { ok: changed ? `Đã áp dụng ${Object.keys(chosen).length} thông số cho công nghệ này.` : "Không có gì thay đổi (thông số đang dùng đã đúng bằng đề xuất)." };
  } catch (e) {
    return fail(e, "Áp dụng hiệu chỉnh");
  }
}
