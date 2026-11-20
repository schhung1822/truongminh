import { machineProfileSchema, type MachineProfileInput } from "@/lib/quoting/schemas";
import { groupDigits, numToText } from "./format";
import { parseGrouped, parsePlain, type Parsed } from "./parse";

/**
 * Các ô nhập thông số máy: nhãn tiếng Việt, đơn vị, gợi ý nghĩa của từng ô. Thuần, có test.
 * Khóa trùng với machineProfileSchema; không có giá trị mặc định nào, ô trống = "Chưa có dữ liệu".
 */

export type MachineKey = keyof MachineProfileInput;

export type MachineField = {
  key: MachineKey;
  label: string;
  unit: string;
  hint: string;
  /** "money": gõ được "1.500.000"; "plain": số thường */
  kind: "plain" | "money";
  /** ô tùy chọn: trống là bình thường, không tính vào "còn thiếu" */
  optional?: boolean;
};

export const MACHINE_FIELDS: MachineField[] = [
  { key: "cutSpeedMmPerSec", label: "Tốc độ cắt", unit: "mm/giây", kind: "plain", hint: "Đầu laser chạy bao nhiêu mm mỗi giây khi cắt viền logo. Thời gian cắt = chu vi logo ÷ tốc độ này." },
  { key: "engraveSpeedMm2PerSec", label: "Tốc độ khắc", unit: "mm2/giây", kind: "plain", hint: "Khắc được bao nhiêu mm2 diện tích mỗi giây. Chỉ cần khi báo giá có khắc (ít, vừa, nhiều)." },
  { key: "setupMinutesPerJob", label: "Thời gian cài đặt mỗi đơn", unit: "phút", kind: "plain", hint: "Chuẩn bị máy, nạp file, căn chỉnh. Tính một lần cho cả đơn, không phụ thuộc số lượng." },
  { key: "sheetChangeMinutes", label: "Thời gian đổi tấm", unit: "phút", kind: "plain", hint: "Thay một tấm mới vào máy và căn lại. Tính cho mỗi tấm dùng." },
  { key: "machineCostPerHour", label: "Chi phí máy mỗi giờ", unit: "đồng/giờ", kind: "money", hint: "Khấu hao, điện, bảo trì chia ra theo mỗi giờ máy chạy." },
  { key: "laborSecondsPerPiece", label: "Công mỗi sản phẩm", unit: "giây/sản phẩm", kind: "plain", hint: "Thời gian thợ làm tay cho mỗi logo (gỡ, bóc, kiểm tra, đóng gói)." },
  { key: "laborCostPerHour", label: "Chi phí công mỗi giờ", unit: "đồng/giờ", kind: "money", hint: "Tiền công của thợ tính theo giờ." },
  { key: "consumableCostPerM2", label: "Vật tư theo m2 (tùy chọn)", unit: "đồng/m2", kind: "money", optional: true, hint: "Dùng cho in UV (mực...), tính theo diện tích logo. Để trống nếu không tính vật tư." },
];

export type MachineRaw = Record<MachineKey, string>;
export type MachineValues = Record<MachineKey, number | null>;

const FIELD_BY_KEY = new Map(MACHINE_FIELDS.map((f) => [f.key, f]));

export function emptyMachineRaw(): MachineRaw {
  return Object.fromEntries(MACHINE_FIELDS.map((f) => [f.key, ""])) as MachineRaw;
}

/** Giá trị đang lưu → ô nhập. Trống giữ trống (không điền sẵn gì). */
export function machineToRaw(v: Partial<MachineValues> | null | undefined): MachineRaw {
  const out = emptyMachineRaw();
  if (!v) return out;
  for (const f of MACHINE_FIELDS) {
    const n = v[f.key];
    out[f.key] = n === null || n === undefined ? "" : f.kind === "money" ? groupDigits(n, 2) : numToText(n);
  }
  return out;
}

export function sameMachineRaw(a: MachineRaw, b: MachineRaw): boolean {
  return MACHINE_FIELDS.every((f) => a[f.key] === b[f.key]);
}

const num = (p: Parsed): number | null => (typeof p === "number" ? p : null);

export function machineRawToInput(raw: Partial<Record<MachineKey, string>>): { ok: true; input: MachineProfileInput } | { error: string } {
  const values: Record<string, number | null> = {};
  for (const f of MACHINE_FIELDS) {
    const text = raw[f.key] ?? "";
    const p = f.kind === "money" ? parseGrouped(text) : parsePlain(text);
    if (p === "invalid") return { error: `${f.label} (${f.unit}): không phải số hợp lệ.` };
    values[f.key] = num(p);
  }
  const parsed = machineProfileSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  return { ok: true, input: parsed.data };
}

export const machineFieldLabel = (key: string): string => FIELD_BY_KEY.get(key as MachineKey)?.label ?? key;
