import { ENGRAVE_LEVEL_LABEL, LAST_SHEET_LABEL, type LastSheetPolicy } from "@/lib/quoting/types";
import { groupDigits, mmToCm, NO_DATA } from "./format";

/**
 * Đọc cột before/after của ConfigChangeLog thành các dòng "tên trường: cũ → mới" bằng tiếng Việt, đúng đơn vị. Thuần, có test.
 * Kích thước tấm lưu mm nhưng hiện bằng cm cho khớp màn hình nhập.
 */

export const ENTITY_LABEL: Record<string, string> = {
  MATERIAL_STOCK: "Chất liệu",
  MACHINE_PROFILE: "Máy",
  QUOTE_SETTINGS: "Cấu hình giá",
};

export const ENTITY_FILTERS = ["MATERIAL_STOCK", "MACHINE_PROFILE", "QUOTE_SETTINGS"] as const;

export type HistoryChange = { field: string; label: string; before: string; after: string };

type Fmt = (v: unknown) => string;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const numUnit =
  (unit: string): Fmt =>
  (v) =>
    isNum(v) ? `${groupDigits(v)} ${unit}` : NO_DATA;

const money: Fmt = (v) => (isNum(v) ? `${groupDigits(v, 2)} đ` : NO_DATA);
const cm: Fmt = (v) => (isNum(v) ? `${groupDigits(mmToCm(v))} cm` : NO_DATA);
const yesNo: Fmt = (v) => (v === true ? "Có" : v === false ? "Không" : NO_DATA);
const policy: Fmt = (v) => (typeof v === "string" && v in LAST_SHEET_LABEL ? LAST_SHEET_LABEL[v as LastSheetPolicy] : NO_DATA);
const intList: Fmt = (v) => (Array.isArray(v) && v.length > 0 ? v.map((x) => (isNum(x) ? groupDigits(x) : String(x))).join(", ") : NO_DATA);

/** Bảng lãi → "1 đến 49: 40%; 50 đến 99: 30%; từ 100: 20%". */
const tiers: Fmt = (v) => {
  if (!Array.isArray(v) || v.length === 0) return NO_DATA;
  const parts = v.map((t) => {
    const o = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
    const from = isNum(o.fromQty) ? groupDigits(o.fromQty) : "?";
    const range = o.toQty === null || o.toQty === undefined ? `từ ${from}` : `${from} đến ${isNum(o.toQty) ? groupDigits(o.toQty) : "?"}`;
    return `${range}: ${isNum(o.markupPct) ? groupDigits(o.markupPct) : "?"}%`;
  });
  return parts.join("; ");
};

type FieldDef = { label: string; fmt: Fmt };

const MATERIAL_FIELDS: Record<string, FieldDef> = {
  stockWidthMm: { label: "Rộng tấm", fmt: cm },
  stockHeightMm: { label: "Cao tấm", fmt: cm },
  stockPrice: { label: "Giá một tấm", fmt: money },
  edgeMarginMm: { label: "Lề tấm", fmt: numUnit("mm") },
  gapMm: { label: "Khoảng cách giữa logo", fmt: numUnit("mm") },
  allowRotate: { label: "Cho xoay logo", fmt: yesNo },
};

const MACHINE_FIELDS_LABEL: Record<string, FieldDef> = {
  cutSpeedMmPerSec: { label: "Tốc độ cắt", fmt: numUnit("mm/giây") },
  engraveSpeedMm2PerSec: { label: "Tốc độ khắc", fmt: numUnit("mm2/giây") },
  setupMinutesPerJob: { label: "Thời gian cài đặt mỗi đơn", fmt: numUnit("phút") },
  sheetChangeMinutes: { label: "Thời gian đổi tấm", fmt: numUnit("phút") },
  machineCostPerHour: { label: "Chi phí máy mỗi giờ", fmt: money },
  laborSecondsPerPiece: { label: "Công mỗi sản phẩm", fmt: numUnit("giây") },
  laborCostPerHour: { label: "Chi phí công mỗi giờ", fmt: money },
  consumableCostPerM2: { label: "Vật tư theo m2", fmt: money },
  tao_moi: { label: "Thông số máy", fmt: () => "" },
};

const SETTINGS_FIELDS: Record<string, FieldDef> = {
  defaultGapMm: { label: "Khoảng cách mặc định", fmt: numUnit("mm") },
  lastSheetPolicy: { label: "Chính sách tấm cuối", fmt: policy },
  marginTiers: { label: "Bảng lãi cộng thêm trên giá vốn", fmt: tiers },
  displayQuantities: { label: "Các mốc số lượng", fmt: intList },
  roundTo: { label: "Làm tròn đơn giá tới", fmt: money },
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function rawText(v: unknown): string {
  if (v === null || v === undefined) return NO_DATA;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** % diện tích khắc: lưu cả cụm {IT, VUA, NHIEU}; tách thành từng mức khác nhau cho dễ đọc. */
function engraveChanges(before: unknown, after: unknown): HistoryChange[] {
  const b = asRecord(before);
  const a = asRecord(after);
  const out: HistoryChange[] = [];
  for (const level of ["IT", "VUA", "NHIEU"] as const) {
    const x = b[level] ?? null;
    const y = a[level] ?? null;
    if (x === y) continue;
    const f = (v: unknown) => (isNum(v) ? `${groupDigits(v)}% diện tích logo` : NO_DATA);
    out.push({ field: `engraveLevels.${level}`, label: `${ENGRAVE_LEVEL_LABEL[level]}: % diện tích khắc`, before: f(x), after: f(y) });
  }
  return out;
}

export function formatChangeLog(entity: string, before: unknown, after: unknown): HistoryChange[] {
  const b = asRecord(before);
  const a = asRecord(after);
  const defs = entity === "MATERIAL_STOCK" ? MATERIAL_FIELDS : entity === "MACHINE_PROFILE" ? MACHINE_FIELDS_LABEL : entity === "QUOTE_SETTINGS" ? SETTINGS_FIELDS : {};

  if (entity === "MACHINE_PROFILE" && a.tao_moi === true) {
    return [{ field: "tao_moi", label: "Thông số máy", before: "", after: "Tạo dòng thông số mới (chưa đổi giá trị nào)" }];
  }

  const out: HistoryChange[] = [];
  for (const key of Object.keys(a)) {
    if (key === "engraveLevels") {
      out.push(...engraveChanges(b[key], a[key]));
      continue;
    }
    const def = defs[key];
    if (def) out.push({ field: key, label: def.label, before: def.fmt(b[key] ?? null), after: def.fmt(a[key] ?? null) });
    else out.push({ field: key, label: key, before: rawText(b[key]), after: rawText(a[key]) });
  }
  return out;
}

/** "cũ → mới" thành một dòng chữ, dùng khi cần xuất hoặc hiển thị gọn. */
export function changeLine(c: HistoryChange): string {
  return c.before === "" ? `${c.label}: ${c.after}` : `${c.label}: ${c.before} → ${c.after}`;
}
