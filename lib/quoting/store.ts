import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { canEditCustomer } from "@/lib/permissions";
import { contourForNesting, measureGeometry, type LogoGeometry } from "@/lib/nesting";
import { loadLogoGeometry } from "@/lib/nesting/logo-image";
import { getStorage } from "@/lib/storage";
import { calibrate, type CalibrationResult } from "./calibration";
import { parseQuoteConfig } from "./config";
import type { MachineProfileInput, MaterialStockInput, QuoteSettingsInput } from "./schemas";
import { computeQuote, type QuoteComputation } from "./quote";
import { suggestSizes, type SizeSuggestion } from "./suggest";
import { isEngraveLevel, type EngraveLevel, type MachineParams, type MaterialStock, type QuoteConfig, type QuoteLine, type QuoteLineFull } from "./types";
import { toAdminView, toSaleView, type AdminQuoteView, type LayoutView, type SaleQuoteView } from "./view";

/**
 * Lớp máy chủ của báo giá: đọc và lưu thông số (có lịch sử thay đổi), hình học logo (có cache), tính giá theo vai, lưu báo giá.
 * Mọi hàm GHI thông số chỉ được gọi sau khi người gọi đã kiểm tra là ADMIN. Giá vốn chỉ đi ra qua toAdminView.
 */

export const QUOTE_SETTINGS_ID = "main";
export const GEOMETRY_ALGO_VERSION = 1;
const MAX_LOGO_MM = 100_000;

const num = (d: { toString(): string } | number | null | undefined): number | null => (d === null || d === undefined ? null : Number(d.toString()));

/* ---------- Cấu hình chung ---------- */

export type QuoteConfigState = { config: QuoteConfig; configVersion: number; updatedAt: Date | null };

export async function getQuoteConfig(): Promise<QuoteConfigState> {
  const row = await db.quoteSettings.findUnique({ where: { id: QUOTE_SETTINGS_ID } });
  const config = parseQuoteConfig(row);
  return { config, configVersion: row?.configVersion ?? 0, updatedAt: row?.updatedAt ?? null };
}

/* ---------- Lịch sử thay đổi ---------- */

type Json = Prisma.InputJsonValue;

function diffFields(before: Record<string, unknown> | null, after: Record<string, unknown>): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    const x = before ? before[k] : undefined;
    if (JSON.stringify(x ?? null) !== JSON.stringify(after[k] ?? null)) {
      b[k] = x ?? null;
      a[k] = after[k] ?? null;
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}

type Tx = Prisma.TransactionClient;

async function logAndBump(tx: Tx, entity: "MATERIAL_STOCK" | "MACHINE_PROFILE" | "QUOTE_SETTINGS", entityId: string, entityLabel: string, d: { before: Record<string, unknown>; after: Record<string, unknown> }, userId: string) {
  await tx.configChangeLog.create({ data: { entity, entityId, entityLabel, before: d.before as Json, after: d.after as Json, userId } });
  // mọi thay đổi ảnh hưởng giá đều tăng phiên bản thông số
  await tx.quoteSettings.upsert({
    where: { id: QUOTE_SETTINGS_ID },
    create: { id: QUOTE_SETTINGS_ID, marginTiers: [], displayQuantities: [], engraveLevels: {}, configVersion: 1, updatedById: userId },
    update: { configVersion: { increment: 1 } },
  });
}

export type ChangeLogRow = { id: string; entity: string; entityId: string; entityLabel: string; before: unknown; after: unknown; userName: string; createdAt: Date };

export async function listChangeLogs(opts?: { entity?: string; limit?: number }): Promise<ChangeLogRow[]> {
  const rows = await db.configChangeLog.findMany({ where: opts?.entity ? { entity: opts.entity } : {}, orderBy: { createdAt: "desc" }, take: Math.min(opts?.limit ?? 100, 500) });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({ id: r.id, entity: r.entity, entityId: r.entityId, entityLabel: r.entityLabel, before: r.before, after: r.after, userName: names.get(r.userId) ?? "(đã xóa)", createdAt: r.createdAt }));
}

/* ---------- Ghi thông số (ADMIN) ---------- */

export async function saveQuoteSettings(input: QuoteSettingsInput, userId: string): Promise<{ changed: boolean }> {
  const existing = await db.quoteSettings.findUnique({ where: { id: QUOTE_SETTINGS_ID } });
  const next = {
    defaultGapMm: input.defaultGapMm,
    lastSheetPolicy: input.lastSheetPolicy,
    marginTiers: [...input.marginTiers].sort((a, b) => a.fromQty - b.fromQty),
    displayQuantities: [...new Set(input.displayQuantities)].sort((a, b) => a - b),
    roundTo: input.roundTo,
    engraveLevels: { IT: input.engraveLevels.IT ?? null, VUA: input.engraveLevels.VUA ?? null, NHIEU: input.engraveLevels.NHIEU ?? null },
  };
  const before = existing
    ? { defaultGapMm: existing.defaultGapMm, lastSheetPolicy: existing.lastSheetPolicy, marginTiers: existing.marginTiers, displayQuantities: existing.displayQuantities, roundTo: existing.roundTo, engraveLevels: existing.engraveLevels }
    : null;
  const d = diffFields(before as Record<string, unknown> | null, next);
  if (!d) return { changed: false };
  await db.$transaction(async (tx) => {
    await tx.configChangeLog.create({ data: { entity: "QUOTE_SETTINGS", entityId: QUOTE_SETTINGS_ID, entityLabel: "Cấu hình giá", before: d.before as Json, after: d.after as Json, userId } });
    await tx.quoteSettings.upsert({
      where: { id: QUOTE_SETTINGS_ID },
      create: { id: QUOTE_SETTINGS_ID, ...next, marginTiers: next.marginTiers as Json, displayQuantities: next.displayQuantities, engraveLevels: next.engraveLevels as Json, configVersion: 1, updatedById: userId },
      update: { ...next, marginTiers: next.marginTiers as Json, displayQuantities: next.displayQuantities, engraveLevels: next.engraveLevels as Json, configVersion: { increment: 1 }, updatedById: userId },
    });
  });
  return { changed: true };
}

export type MachineProfileRow = MachineParams & { id: string; technique: string; updatedAt: Date };

function profileRow(r: { id: string; technique: string; updatedAt: Date; cutSpeedMmPerSec: number | null; engraveSpeedMm2PerSec: number | null; setupMinutesPerJob: number | null; sheetChangeMinutes: number | null; machineCostPerHour: unknown; laborSecondsPerPiece: number | null; laborCostPerHour: unknown; consumableCostPerM2: unknown }): MachineProfileRow {
  return {
    id: r.id,
    technique: r.technique,
    updatedAt: r.updatedAt,
    cutSpeedMmPerSec: r.cutSpeedMmPerSec,
    engraveSpeedMm2PerSec: r.engraveSpeedMm2PerSec,
    setupMinutesPerJob: r.setupMinutesPerJob,
    sheetChangeMinutes: r.sheetChangeMinutes,
    machineCostPerHour: num(r.machineCostPerHour as never),
    laborSecondsPerPiece: r.laborSecondsPerPiece,
    laborCostPerHour: num(r.laborCostPerHour as never),
    consumableCostPerM2: num(r.consumableCostPerM2 as never),
  };
}

export async function listMachineProfiles(): Promise<MachineProfileRow[]> {
  return (await db.machineProfile.findMany({ orderBy: { technique: "asc" } })).map(profileRow);
}

export async function getMachineProfile(technique: string): Promise<MachineProfileRow | null> {
  const r = await db.machineProfile.findUnique({ where: { technique } });
  return r ? profileRow(r) : null;
}

export async function saveMachineProfile(technique: string, input: MachineProfileInput, userId: string): Promise<{ changed: boolean }> {
  const t = technique.trim();
  if (!t || t.length > 60) throw new Error("Công nghệ không hợp lệ.");
  const existing = await getMachineProfile(t);
  const next: Record<string, unknown> = { ...input };
  const before = existing ? (Object.fromEntries(Object.keys(next).map((k) => [k, (existing as Record<string, unknown>)[k]])) as Record<string, unknown>) : null;
  const d = diffFields(before, next);
  if (!d && existing) return { changed: false };
  await db.$transaction(async (tx) => {
    await tx.machineProfile.upsert({ where: { technique: t }, create: { technique: t, ...input, updatedById: userId }, update: { ...input, updatedById: userId } });
    if (d) await logAndBump(tx, "MACHINE_PROFILE", t, `Máy: ${t}`, d, userId);
    else await logAndBump(tx, "MACHINE_PROFILE", t, `Máy: ${t}`, { before: {}, after: { tao_moi: true } }, userId);
  });
  return { changed: true };
}

export function materialStockOf(m: { stockWidthMm: number | null; stockHeightMm: number | null; stockPrice: unknown; edgeMarginMm: number | null; gapMm: number | null; allowRotate: boolean; technique: string | null }): MaterialStock {
  return {
    stockWidthMm: m.stockWidthMm,
    stockHeightMm: m.stockHeightMm,
    stockPrice: num(m.stockPrice as never),
    edgeMarginMm: m.edgeMarginMm,
    gapMm: m.gapMm,
    allowRotate: m.allowRotate,
    technique: m.technique,
  };
}

export async function saveMaterialStock(materialId: string, input: MaterialStockInput, userId: string): Promise<{ changed: boolean }> {
  const m = await db.material.findUnique({ where: { id: materialId } });
  if (!m) throw new Error("Không tìm thấy chất liệu.");
  const before = { stockWidthMm: m.stockWidthMm, stockHeightMm: m.stockHeightMm, stockPrice: num(m.stockPrice), edgeMarginMm: m.edgeMarginMm, gapMm: m.gapMm, allowRotate: m.allowRotate };
  const d = diffFields(before, { ...input });
  if (!d) return { changed: false };
  await db.$transaction(async (tx) => {
    await tx.material.update({ where: { id: materialId }, data: { ...input } });
    await logAndBump(tx, "MATERIAL_STOCK", materialId, `${m.code} · ${m.name}`, d, userId);
  });
  return { changed: true };
}

/* ---------- Hình học logo (cache) ---------- */

function validGeometry(g: unknown): g is LogoGeometry {
  if (!g || typeof g !== "object") return false;
  const o = g as Record<string, unknown>;
  return typeof o.widthHeightRatio === "number" && Array.isArray(o.outers) && Array.isArray(o.holes) && typeof o.areaFraction === "number" && typeof o.fallbackRect === "boolean";
}

export async function getLogoGeometry(logoId: string, normalizedPath: string): Promise<LogoGeometry> {
  const cached = await db.logoGeometry.findUnique({ where: { logoId } });
  if (cached && cached.algoVersion === GEOMETRY_ALGO_VERSION && validGeometry(cached.geometry)) return cached.geometry;
  const g = await loadLogoGeometry(await getStorage().get(normalizedPath));
  await db.logoGeometry
    .upsert({ where: { logoId }, create: { logoId, geometry: g as unknown as Json, algoVersion: GEOMETRY_ALGO_VERSION }, update: { geometry: g as unknown as Json, algoVersion: GEOMETRY_ALGO_VERSION } })
    .catch(() => {}); // cache hỏng không làm hỏng việc tính giá
  return g;
}

/* ---------- Tính báo giá ---------- */

export type Actor = Pick<SessionUser, "id" | "role">;

export type QuoteRequest = {
  logoId: string;
  materialId: string;
  widthMm: number;
  /** chiều cao (mm); bỏ trống thì tính theo tỉ lệ khung bao thật của logo */
  heightMm?: number | null;
  engraveLevel: EngraveLevel;
  quantities?: number[];
};

export type LogoInfo = {
  widthMm: number;
  heightMm: number;
  /** rộng / cao của khung bao thật */
  ratio: number;
  perimeterMm: number;
  areaMm2: number;
  fallbackRect: boolean;
  backgroundRemoved: boolean;
  warnings: string[];
};

export type QuoteResponse = {
  view: SaleQuoteView | AdminQuoteView;
  logo: LogoInfo;
  suggestions: SizeSuggestion[];
  materialLabel: string;
  configVersion: number;
};

type Prepared = { computation: QuoteComputation; logo: LogoInfo; materialLabel: string; configVersion: number; stockInput: MaterialStock; machine: MachineParams | null; config: QuoteConfig };

function validateRequest(req: QuoteRequest): string | null {
  if (!isEngraveLevel(req.engraveLevel)) return "Mức khắc không hợp lệ.";
  if (!Number.isFinite(req.widthMm) || req.widthMm <= 0 || req.widthMm > MAX_LOGO_MM) return "Chiều rộng logo phải là số lớn hơn 0.";
  if (req.heightMm != null && (!Number.isFinite(req.heightMm) || req.heightMm <= 0 || req.heightMm > MAX_LOGO_MM)) return "Chiều cao logo phải là số lớn hơn 0.";
  if (req.quantities && (req.quantities.length > 12 || req.quantities.some((q) => !Number.isInteger(q) || q < 1 || q > 10_000_000))) return "Số lượng không hợp lệ.";
  return null;
}

async function prepare(req: QuoteRequest): Promise<Prepared | { error: string }> {
  const bad = validateRequest(req);
  if (bad) return { error: bad };
  const [logo, material, state, profiles] = await Promise.all([
    db.logo.findUnique({ where: { id: req.logoId }, select: { id: true, normalizedPath: true } }),
    db.material.findUnique({ where: { id: req.materialId } }),
    getQuoteConfig(),
    db.machineProfile.findMany(),
  ]);
  if (!logo) return { error: "Không tìm thấy logo." };
  if (!material) return { error: "Không tìm thấy chất liệu." };

  const geometry = await getLogoGeometry(logo.id, logo.normalizedPath);
  const widthMm = req.widthMm;
  const heightMm = req.heightMm ?? widthMm / geometry.widthHeightRatio;
  const measure = measureGeometry(geometry, widthMm, heightMm);
  const stock = materialStockOf(material);
  const row = stock.technique ? profiles.find((p) => p.technique === stock.technique) : undefined;
  const machine = row ? profileRow(row) : null;

  const computation = computeQuote({
    material: stock,
    machine,
    config: state.config,
    logo: { widthMm, heightMm, perimeterMm: measure.perimeterMm, areaMm2: measure.areaMm2 },
    contour: contourForNesting(geometry, widthMm, heightMm),
    engraveLevel: req.engraveLevel,
    quantities: req.quantities,
  });
  return {
    computation,
    logo: { widthMm, heightMm, ratio: geometry.widthHeightRatio, perimeterMm: measure.perimeterMm, areaMm2: measure.areaMm2, fallbackRect: geometry.fallbackRect, backgroundRemoved: geometry.backgroundRemoved, warnings: geometry.warnings },
    materialLabel: `${material.code} · ${material.name}`,
    configVersion: state.configVersion,
    stockInput: stock,
    machine,
    config: state.config,
  };
}

/** Tính báo giá và trả về đúng góc nhìn theo vai: sale không bao giờ nhận giá vốn. */
export async function quoteForUser(user: Actor, req: QuoteRequest, opts?: { suggest?: boolean }): Promise<QuoteResponse | { error: string }> {
  const p = await prepare(req);
  if ("error" in p) return p;
  const c = p.computation;
  const view = user.role === "ADMIN" ? toAdminView(c) : toSaleView(c);
  let suggestions: SizeSuggestion[] = [];
  if (c.ok && opts?.suggest !== false) {
    suggestions = suggestSizes({
      stockWidthMm: c.stock.widthMm,
      stockHeightMm: c.stock.heightMm,
      edgeMarginMm: c.stock.edgeMarginMm,
      gapMm: c.stock.gapMm,
      logoWidthMm: p.logo.widthMm,
      logoHeightMm: p.logo.heightMm,
      allowRotate: p.stockInput.allowRotate,
    });
  }
  return { view, logo: p.logo, suggestions, materialLabel: p.materialLabel, configVersion: p.configVersion };
}

/** So sánh nhanh cùng một logo trên vài chất liệu (tối đa 4). */
export async function compareMaterials(user: Actor, req: Omit<QuoteRequest, "materialId"> & { materialIds: string[] }): Promise<{ materialId: string; materialLabel: string; view: SaleQuoteView | AdminQuoteView }[] | { error: string }> {
  const ids = [...new Set(req.materialIds)].slice(0, 4);
  if (ids.length === 0) return { error: "Chưa chọn chất liệu nào." };
  const out: { materialId: string; materialLabel: string; view: SaleQuoteView | AdminQuoteView }[] = [];
  for (const materialId of ids) {
    const r = await quoteForUser(user, { ...req, materialId }, { suggest: false });
    if ("error" in r) return r;
    out.push({ materialId, materialLabel: r.materialLabel, view: r.view });
  }
  return out;
}

/* ---------- Lưu và đọc báo giá ---------- */

async function canUseLogo(user: Actor, logoId: string): Promise<boolean> {
  const logo = await db.logo.findUnique({ where: { id: logoId }, select: { brand: { select: { customer: { select: { ownerId: true, createdById: true } } } } } });
  return !!logo && canEditCustomer(user, logo.brand.customer);
}

/** Tính lại trên máy chủ (không tin số từ trình duyệt) rồi lưu báo giá nháp. */
export async function saveQuote(user: Actor, req: QuoteRequest & { sessionId?: string | null; note?: string | null }): Promise<{ id: string } | { error: string }> {
  if (!(await canUseLogo(user, req.logoId))) return { error: "Bạn không có quyền lập báo giá cho khách hàng này." };
  const p = await prepare(req);
  if ("error" in p) return p;
  const c = p.computation;
  if (!c.ok) return { error: c.reason === "MISSING" ? "Thiếu thông số, chưa tính được giá." : c.error };
  const note = req.note?.trim().slice(0, 2000) || null;
  const q = await db.quote.create({
    data: {
      sessionId: req.sessionId || null,
      logoId: req.logoId,
      materialId: req.materialId,
      logoWidthMm: p.logo.widthMm,
      logoHeightMm: p.logo.heightMm,
      engraveLevel: req.engraveLevel,
      perSheet: c.perSheet,
      efficiencyPct: c.efficiencyPct,
      nestingStrategy: c.nesting.strategy,
      nestingLabel: c.nesting.label.slice(0, 300),
      // bố cục kèm kích thước tấm (không phải bí mật) để xem lại đúng như lúc lập, kể cả khi thông số tấm đổi sau này
      placements: { stock: c.stock, items: c.nesting.placements } as unknown as Json,
      configVersion: p.configVersion,
      note,
      createdById: user.id,
      lines: { create: c.lines.map((l) => ({ quantity: l.quantity, sheetsNeeded: l.sheetsNeeded, machineMinutes: l.machineMinutes, unitPrice: l.unitPrice, totalPrice: l.totalPrice })) },
      cost: { create: { paramsSnapshot: c.params as unknown as Json, costDetail: c.lines.map((l) => ({ quantity: l.quantity, ...l.cost })) as unknown as Json } },
    },
    select: { id: true },
  });
  return { id: q.id };
}

export type StoredQuote = {
  id: string;
  status: "DRAFT" | "SENT" | "WON";
  sessionId: string | null;
  logoId: string;
  materialId: string;
  materialLabel: string;
  logoWidthMm: number;
  logoHeightMm: number;
  engraveLevel: string;
  perSheet: number;
  efficiencyPct: number;
  layout: Pick<LayoutView, "strategy" | "label" | "placements"> & { stock: LayoutView["stock"] | null };
  lines: QuoteLine[];
  configVersion: number;
  note: string | null;
  createdByName: string;
  createdAt: Date;
  sentAt: Date | null;
  wonAt: Date | null;
  /** CHỈ có khi người xem là admin */
  cost?: { params: unknown; lines: unknown };
};

/** Đọc cột bố cục đã lưu: { stock, items }. */
function readLayout(raw: unknown): { stock: LayoutView["stock"] | null; items: LayoutView["placements"] } {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as { stock?: LayoutView["stock"]; items?: LayoutView["placements"] };
    return { stock: o.stock ?? null, items: Array.isArray(o.items) ? o.items : [] };
  }
  return { stock: null, items: Array.isArray(raw) ? (raw as LayoutView["placements"]) : [] };
}

export async function getQuote(user: Actor, id: string): Promise<StoredQuote | null> {
  const isAdmin = user.role === "ADMIN";
  const q = await db.quote.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { quantity: "asc" } },
      material: { select: { code: true, name: true } },
      createdBy: { select: { name: true } },
      // giá vốn chỉ được tải khi là admin: sale không bao giờ chạm tới bảng này
      ...(isAdmin ? { cost: true } : {}),
    },
  });
  if (!q) return null;
  const cost = isAdmin ? (q as unknown as { cost: { paramsSnapshot: unknown; costDetail: unknown } | null }).cost : null;
  return {
    id: q.id,
    status: q.status,
    sessionId: q.sessionId,
    logoId: q.logoId,
    materialId: q.materialId,
    materialLabel: `${q.material.code} · ${q.material.name}`,
    logoWidthMm: q.logoWidthMm,
    logoHeightMm: q.logoHeightMm,
    engraveLevel: q.engraveLevel,
    perSheet: q.perSheet,
    efficiencyPct: q.efficiencyPct,
    layout: { strategy: q.nestingStrategy, label: q.nestingLabel, placements: readLayout(q.placements).items, stock: readLayout(q.placements).stock },
    lines: q.lines.map((l) => ({ quantity: l.quantity, sheetsNeeded: l.sheetsNeeded, machineMinutes: l.machineMinutes, unitPrice: l.unitPrice, totalPrice: l.totalPrice })),
    configVersion: q.configVersion,
    note: q.note,
    createdByName: q.createdBy.name,
    createdAt: q.createdAt,
    sentAt: q.sentAt,
    wonAt: q.wonAt,
    ...(isAdmin && cost ? { cost: { params: cost.paramsSnapshot, lines: cost.costDetail } } : {}),
  };
}

export type QuoteListRow = { id: string; status: "DRAFT" | "SENT" | "WON"; materialLabel: string; logoWidthMm: number; perSheet: number; firstUnitPrice: number | null; createdByName: string; createdAt: Date };

/** Danh sách báo giá của một logo hoặc một phiên (ai cũng xem được, theo quy tắc chung của dự án). Không có giá vốn. */
export async function listQuotes(filter: { logoId?: string; sessionId?: string; limit?: number }): Promise<QuoteListRow[]> {
  const rows = await db.quote.findMany({
    where: { ...(filter.logoId ? { logoId: filter.logoId } : {}), ...(filter.sessionId ? { sessionId: filter.sessionId } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(filter.limit ?? 50, 200),
    include: { material: { select: { code: true, name: true } }, createdBy: { select: { name: true } }, lines: { orderBy: { quantity: "asc" }, take: 1 } },
  });
  return rows.map((q) => ({ id: q.id, status: q.status, materialLabel: `${q.material.code} · ${q.material.name}`, logoWidthMm: q.logoWidthMm, perSheet: q.perSheet, firstUnitPrice: q.lines[0]?.unitPrice ?? null, createdByName: q.createdBy.name, createdAt: q.createdAt }));
}

export async function setQuoteStatus(user: Actor, id: string, status: "DRAFT" | "SENT" | "WON"): Promise<{ ok: true } | { error: string }> {
  const q = await db.quote.findUnique({ where: { id }, select: { createdById: true, status: true } });
  if (!q) return { error: "Không tìm thấy báo giá." };
  if (user.role !== "ADMIN" && q.createdById !== user.id) return { error: "Chỉ người lập báo giá hoặc quản trị viên mới đổi được trạng thái." };
  const now = new Date();
  await db.quote.update({
    where: { id },
    data: { status, ...(status === "SENT" ? { sentAt: now } : {}), ...(status === "WON" ? { wonAt: now } : {}), ...(status === "DRAFT" ? { sentAt: null, wonAt: null } : {}) },
  });
  return { ok: true };
}

export async function deleteDraftQuote(user: Actor, id: string): Promise<{ ok: true } | { error: string }> {
  const q = await db.quote.findUnique({ where: { id }, select: { createdById: true, status: true } });
  if (!q) return { ok: true };
  if (user.role !== "ADMIN" && q.createdById !== user.id) return { error: "Chỉ người lập báo giá hoặc quản trị viên mới xóa được." };
  if (q.status !== "DRAFT") return { error: "Chỉ xóa được báo giá đang là nháp." };
  await db.quote.delete({ where: { id } });
  return { ok: true };
}

/* ---------- Thời gian máy thực tế và hiệu chỉnh (ADMIN) ---------- */

export type MachineTimeInput = { quoteId?: string | null; description: string; technique: string; totalCutMm: number; engraveAreaMm2: number; sheets: number; actualMinutes: number };

export async function addMachineTimeLog(input: MachineTimeInput, userId: string): Promise<{ id: string }> {
  const r = await db.machineTimeLog.create({
    data: {
      quoteId: input.quoteId || null,
      description: input.description.trim().slice(0, 300),
      technique: input.technique.trim().slice(0, 60),
      totalCutMm: input.totalCutMm,
      engraveAreaMm2: input.engraveAreaMm2,
      sheets: input.sheets,
      actualMinutes: input.actualMinutes,
      createdById: userId,
    },
    select: { id: true },
  });
  return r;
}

export async function listMachineTimeLogs(technique?: string, limit = 200) {
  return db.machineTimeLog.findMany({ where: technique ? { technique } : {}, orderBy: { createdAt: "desc" }, take: Math.min(limit, 1000) });
}

export async function deleteMachineTimeLog(id: string): Promise<void> {
  await db.machineTimeLog.deleteMany({ where: { id } });
}

export type CalibrationView = { technique: string; result: CalibrationResult; current: MachineProfileRow | null };

export async function calibrationFor(technique: string): Promise<CalibrationView> {
  const [logs, current] = await Promise.all([db.machineTimeLog.findMany({ where: { technique } }), getMachineProfile(technique)]);
  const result = calibrate(logs.map((l) => ({ totalCutMm: l.totalCutMm, engraveAreaMm2: l.engraveAreaMm2, sheets: l.sheets, actualMinutes: l.actualMinutes })));
  return { technique, result, current };
}

/** Gợi ý số liệu điền sẵn khi ghi thời gian thực tế cho một báo giá đã lưu và một mốc số lượng. */
export async function timeLogDefaultsFromQuote(quoteId: string, quantity: number): Promise<{ technique: string; totalCutMm: number; engraveAreaMm2: number; sheets: number; description: string } | { error: string }> {
  const q = await db.quote.findUnique({ where: { id: quoteId }, include: { material: true, logo: { select: { id: true, normalizedPath: true, brand: { select: { name: true } } } }, lines: true } });
  if (!q) return { error: "Không tìm thấy báo giá." };
  const line = q.lines.find((l) => l.quantity === quantity);
  if (!line) return { error: "Báo giá này không có mốc số lượng đó." };
  const g = await getLogoGeometry(q.logo.id, q.logo.normalizedPath);
  const m = measureGeometry(g, q.logoWidthMm, q.logoHeightMm);
  const state = await getQuoteConfig();
  const share = q.engraveLevel === "KHONG_KHAC" ? 0 : (state.config.engravePct[q.engraveLevel as "IT" | "VUA" | "NHIEU"] ?? 0);
  return {
    technique: q.material.technique ?? "",
    totalCutMm: m.perimeterMm * quantity,
    engraveAreaMm2: ((m.areaMm2 * share) / 100) * quantity,
    sheets: line.sheetsNeeded,
    description: `${q.logo.brand.name} · ${q.material.code} · ${quantity} cái`,
  };
}

export type { QuoteComputation, QuoteLineFull };
