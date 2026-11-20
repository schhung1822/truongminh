import "server-only";
import { db } from "@/lib/db";
import { loadOptions } from "@/lib/materials/options";
import { optionLabel } from "@/lib/materials/option-types";
import { getQuoteConfig, listMachineProfiles, materialStockOf, type MachineProfileRow } from "@/lib/quoting/store";
import type { QuoteConfig } from "@/lib/quoting/types";
import type { MachineValues } from "./machine-form";
import { machineMissing, machineState, materialMissing, type MachineState } from "./status";

/**
 * Nạp dữ liệu cho các trang thiết lập báo giá. Chỉ gọi sau requireAdmin().
 * Mọi thứ trả về đều tuần tự hóa được (không Decimal, không Date) để đưa thẳng cho component trình duyệt.
 */

/** Giới hạn an toàn số chất liệu nạp một lần (thư viện thật nhỏ hơn nhiều). */
export const MAX_LOAD_MATERIALS = 2000;

export type MaterialRow = {
  id: string;
  code: string;
  name: string;
  group: string;
  technique: string | null;
  techniqueLabel: string;
  stockWidthMm: number | null;
  stockHeightMm: number | null;
  stockPrice: number | null;
  edgeMarginMm: number | null;
  gapMm: number | null;
  allowRotate: boolean;
  /** mã thông số TẤM còn thiếu (xem MATERIAL_MISSING_SHORT) */
  missing: string[];
  /** tình trạng thông số máy của công nghệ chất liệu; null = chất liệu chưa có công nghệ */
  machine: MachineState | null;
};

export type TechniqueInfo = {
  value: string;
  label: string;
  inCatalog: boolean;
  catalogActive: boolean;
  /** số chất liệu ĐANG BẬT dùng công nghệ này */
  activeMaterials: number;
  values: MachineValues;
  /** chuỗi ISO, null nếu chưa có dòng thông số máy */
  profileUpdatedAt: string | null;
  state: MachineState;
  /** nhãn các thông số máy còn thiếu */
  missingLabels: string[];
};

export type QuotingData = {
  config: QuoteConfig;
  configVersion: number;
  /** chuỗi ISO, null nếu chưa từng lưu gì */
  updatedAt: string | null;
  techniques: TechniqueInfo[];
  rows: MaterialRow[];
  truncated: boolean;
};

function valuesOf(p: MachineProfileRow | null): MachineValues {
  return {
    cutSpeedMmPerSec: p?.cutSpeedMmPerSec ?? null,
    engraveSpeedMm2PerSec: p?.engraveSpeedMm2PerSec ?? null,
    setupMinutesPerJob: p?.setupMinutesPerJob ?? null,
    sheetChangeMinutes: p?.sheetChangeMinutes ?? null,
    machineCostPerHour: p?.machineCostPerHour ?? null,
    laborSecondsPerPiece: p?.laborSecondsPerPiece ?? null,
    laborCostPerHour: p?.laborCostPerHour ?? null,
    consumableCostPerM2: p?.consumableCostPerM2 ?? null,
  };
}

export async function loadQuotingData(): Promise<QuotingData> {
  const [state, profiles, options, mats] = await Promise.all([
    getQuoteConfig(),
    listMachineProfiles(),
    loadOptions(),
    db.material.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      take: MAX_LOAD_MATERIALS + 1,
      select: {
        id: true,
        code: true,
        name: true,
        groupName: true,
        baseMaterial: true,
        printTech: true,
        technique: true,
        stockWidthMm: true,
        stockHeightMm: true,
        stockPrice: true,
        edgeMarginMm: true,
        gapMm: true,
        allowRotate: true,
      },
    }),
  ]);
  const truncated = mats.length > MAX_LOAD_MATERIALS;
  const active = truncated ? mats.slice(0, MAX_LOAD_MATERIALS) : mats;
  const profileBy = new Map(profiles.map((p) => [p.technique, p]));

  const usage = new Map<string, number>();
  for (const m of active) if (m.technique) usage.set(m.technique, (usage.get(m.technique) ?? 0) + 1);

  // công nghệ = danh mục đang bật + công nghệ chất liệu đang dùng + công nghệ đã có dòng thông số máy
  const catalog = options.filter((o) => o.type === "TECHNIQUE");
  const catalogBy = new Map(catalog.map((o) => [o.value, o]));
  const values = new Set<string>([...catalog.filter((o) => o.isActive).map((o) => o.value), ...usage.keys(), ...profileBy.keys()]);

  const techniques: TechniqueInfo[] = [...values].map((value) => {
    const p = profileBy.get(value) ?? null;
    const missing = machineMissing(value, p);
    const opt = catalogBy.get(value);
    return {
      value,
      label: optionLabel(options, "TECHNIQUE", value),
      inCatalog: !!opt,
      catalogActive: !!opt?.isActive,
      activeMaterials: usage.get(value) ?? 0,
      values: valuesOf(p),
      profileUpdatedAt: p ? p.updatedAt.toISOString() : null,
      state: machineState(missing),
      missingLabels: missing.map((x) => x.label),
    };
  });
  techniques.sort((a, b) => Number(b.activeMaterials > 0) - Number(a.activeMaterials > 0) || Number(b.catalogActive) - Number(a.catalogActive) || a.label.localeCompare(b.label, "vi"));
  const stateBy = new Map(techniques.map((t) => [t.value, t.state]));

  const rows: MaterialRow[] = active.map((m) => {
    const stock = materialStockOf(m);
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      group: optionLabel(options, "BASE_MATERIAL", m.baseMaterial) || m.groupName,
      technique: m.technique,
      techniqueLabel: m.technique ? optionLabel(options, "TECHNIQUE", m.technique) : "",
      stockWidthMm: stock.stockWidthMm,
      stockHeightMm: stock.stockHeightMm,
      stockPrice: stock.stockPrice,
      edgeMarginMm: stock.edgeMarginMm,
      gapMm: stock.gapMm,
      allowRotate: stock.allowRotate,
      missing: materialMissing(stock, state.config).map((x) => x.code),
      machine: m.technique ? (stateBy.get(m.technique) ?? "none") : null,
    };
  });

  return { config: state.config, configVersion: state.configVersion, updatedAt: state.updatedAt ? state.updatedAt.toISOString() : null, techniques, rows, truncated };
}

/** Nhãn công nghệ theo giá trị (cho các trang cần hiện tên thay vì mã). */
export async function loadTechniqueLabels(): Promise<Map<string, string>> {
  const options = await loadOptions();
  return new Map(options.filter((o) => o.type === "TECHNIQUE").map((o) => [o.value, o.label]));
}

/** Danh sách công nghệ để chọn (form ghi thời gian, bộ lọc): danh mục đang bật, công nghệ chất liệu dùng, đã có thông số máy hoặc đã có bản ghi thời gian. */
export async function loadTechniqueChoices(): Promise<{ value: string; label: string }[]> {
  const [options, used, profiles, logged] = await Promise.all([
    loadOptions(),
    db.material.groupBy({ by: ["technique"], where: { isActive: true, technique: { not: null } } }),
    db.machineProfile.findMany({ select: { technique: true } }),
    db.machineTimeLog.groupBy({ by: ["technique"] }),
  ]);
  const values = new Set<string>([
    ...options.filter((o) => o.type === "TECHNIQUE" && o.isActive).map((o) => o.value),
    ...used.map((u) => u.technique).filter((t): t is string => !!t),
    ...profiles.map((p) => p.technique),
    ...logged.map((l) => l.technique),
  ]);
  return [...values].map((value) => ({ value, label: optionLabel(options, "TECHNIQUE", value) })).sort((a, b) => a.label.localeCompare(b.label, "vi"));
}
