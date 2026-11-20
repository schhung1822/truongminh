import { z } from "zod";
import { validateMarginTiers } from "./config";
import { ENGRAVE_LEVELS, LAST_SHEET_POLICIES } from "./types";

/**
 * Kiểm tra dữ liệu admin nhập cho các thông số báo giá (dùng ở máy chủ và để dựng form).
 * Ô để trống = null = "chưa có dữ liệu" (chưa tính được giá), không phải số 0.
 */

/** Chữ hoặc số trong form → số hoặc null. Cho phép dấu phẩy thập phân kiểu Việt Nam ("1,5"); từ chối "1.500" mơ hồ nếu có cả hai dấu. */
export function parseNumberInput(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : "invalid";
  const s = String(v).trim();
  if (s === "") return null;
  if (s.includes(",") && s.includes(".")) return "invalid";
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : "invalid";
}

const optNumber = (label: string, opts: { min?: number; max?: number; int?: boolean; gt0?: boolean } = {}) =>
  z.unknown().transform((v, ctx) => {
    const n = parseNumberInput(v);
    if (n === "invalid") {
      ctx.addIssue({ code: "custom", message: `${label}: không phải số hợp lệ.` });
      return z.NEVER;
    }
    if (n === null) return null;
    if (opts.gt0 && n <= 0) ctx.addIssue({ code: "custom", message: `${label}: phải lớn hơn 0.` });
    if (opts.min !== undefined && n < opts.min) ctx.addIssue({ code: "custom", message: `${label}: tối thiểu ${opts.min}.` });
    if (opts.max !== undefined && n > opts.max) ctx.addIssue({ code: "custom", message: `${label}: tối đa ${opts.max}.` });
    if (opts.int && !Number.isInteger(n)) ctx.addIssue({ code: "custom", message: `${label}: phải là số nguyên.` });
    return n;
  });

/** Thông số tấm của một chất liệu (mm, đồng). */
export const materialStockSchema = z.object({
  stockWidthMm: optNumber("Chiều rộng tấm", { gt0: true, max: 100_000 }),
  stockHeightMm: optNumber("Chiều cao tấm", { gt0: true, max: 100_000 }),
  stockPrice: optNumber("Giá một tấm", { gt0: true, max: 1_000_000_000_000 }),
  edgeMarginMm: optNumber("Lề tấm", { min: 0, max: 10_000 }),
  gapMm: optNumber("Khoảng cách giữa logo", { min: 0, max: 10_000 }),
  allowRotate: z.boolean(),
});
export type MaterialStockInput = z.infer<typeof materialStockSchema>;

export const machineProfileSchema = z.object({
  cutSpeedMmPerSec: optNumber("Tốc độ cắt", { gt0: true, max: 100_000 }),
  engraveSpeedMm2PerSec: optNumber("Tốc độ khắc", { gt0: true, max: 1_000_000 }),
  setupMinutesPerJob: optNumber("Thời gian cài đặt mỗi đơn", { min: 0, max: 100_000 }),
  sheetChangeMinutes: optNumber("Thời gian đổi tấm", { min: 0, max: 100_000 }),
  machineCostPerHour: optNumber("Chi phí máy mỗi giờ", { min: 0, max: 1_000_000_000 }),
  laborSecondsPerPiece: optNumber("Công mỗi sản phẩm", { min: 0, max: 1_000_000 }),
  laborCostPerHour: optNumber("Chi phí công mỗi giờ", { min: 0, max: 1_000_000_000 }),
  consumableCostPerM2: optNumber("Chi phí vật tư mỗi m2", { min: 0, max: 1_000_000_000_000 }),
});
export type MachineProfileInput = z.infer<typeof machineProfileSchema>;

const tierSchema = z.object({
  fromQty: z.number().int().min(1),
  toQty: z.number().int().min(1).nullable(),
  markupPct: z.number().min(0).max(1000),
});

export const quoteSettingsSchema = z
  .object({
    defaultGapMm: optNumber("Khoảng cách mặc định", { min: 0, max: 10_000 }),
    lastSheetPolicy: z.enum(LAST_SHEET_POLICIES).nullable(),
    marginTiers: z.array(tierSchema).max(20, "Tối đa 20 bậc."),
    displayQuantities: z.array(z.number().int().min(1).max(10_000_000)).max(12, "Tối đa 12 mốc số lượng."),
    roundTo: optNumber("Làm tròn giá", { min: 1, max: 1_000_000, int: true }),
    engraveLevels: z.object(Object.fromEntries(ENGRAVE_LEVELS.filter((l) => l !== "KHONG_KHAC").map((l) => [l, optNumber(`Mức khắc ${l}`, { min: 0, max: 100 })])) as Record<"IT" | "VUA" | "NHIEU", ReturnType<typeof optNumber>>),
  })
  .superRefine((v, ctx) => {
    const err = validateMarginTiers(v.marginTiers);
    if (err) ctx.addIssue({ code: "custom", message: err, path: ["marginTiers"] });
  });
export type QuoteSettingsInput = z.infer<typeof quoteSettingsSchema>;
