import type { MachineKey, MachineValues } from "./machine-form";
import { MACHINE_FIELDS } from "./machine-form";

/**
 * Hiệu chỉnh: bốn thông số máy mà thời gian thực tế ước lượng được, và cách GỘP phần đề xuất vào dòng thông số máy hiện có. Thuần, có test.
 * Chỉ các trường được chọn bị đổi; mọi trường khác (kể cả chi phí máy, công) giữ nguyên.
 */

export const CALIBRATION_KEYS = ["setupMinutesPerJob", "sheetChangeMinutes", "cutSpeedMmPerSec", "engraveSpeedMm2PerSec"] as const;
export type CalibrationKey = (typeof CALIBRATION_KEYS)[number];

export const CALIBRATION_LABEL: Record<CalibrationKey, { label: string; unit: string }> = {
  setupMinutesPerJob: { label: "Thời gian cài đặt mỗi đơn", unit: "phút" },
  sheetChangeMinutes: { label: "Thời gian đổi tấm", unit: "phút" },
  cutSpeedMmPerSec: { label: "Tốc độ cắt", unit: "mm/giây" },
  engraveSpeedMm2PerSec: { label: "Tốc độ khắc", unit: "mm2/giây" },
};

export const isCalibrationKey = (k: unknown): k is CalibrationKey => typeof k === "string" && (CALIBRATION_KEYS as readonly string[]).includes(k);

/** Giá trị đề xuất làm tròn 4 chữ số có nghĩa: số hiển thị chính là số sẽ được lưu khi bấm Áp dụng. */
export const roundSuggestion = (v: number): number => Number(v.toPrecision(4));

/** Gộp: lấy dòng hiện có (hoặc rỗng nếu chưa có), chỉ ghi đè các trường trong `picks`. */
export function mergeCalibration(current: Partial<MachineValues> | null, picks: Partial<Record<CalibrationKey, number>>): MachineValues {
  const out = Object.fromEntries(MACHINE_FIELDS.map((f) => [f.key, current?.[f.key] ?? null])) as MachineValues;
  for (const k of CALIBRATION_KEYS) {
    const v = picks[k];
    if (v !== undefined) out[k as MachineKey] = v;
  }
  return out;
}
