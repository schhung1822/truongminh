import { markupFor } from "@/lib/quoting/config";
import { findMissing } from "@/lib/quoting/missing";
import type { MachineParams, MaterialStock, MissingParam, QuoteConfig } from "@/lib/quoting/types";
import { groupDigits } from "./format";

/**
 * Kiểm tra "đã đủ thông số để báo giá chưa" cho trang Tình trạng thông số và cột Còn thiếu của bảng tấm. Thuần, có test.
 * Dùng findMissing của lib/quoting để luôn khớp với bộ tính giá; các hàm dưới chỉ lọc kết quả theo phạm vi.
 * Các giá trị "giả" truyền vào findMissing chỉ để nó không kêu thiếu phần mà ta không hỏi; không hiển thị và không lưu đâu cả.
 */

const EMPTY_CONFIG: QuoteConfig = { defaultGapMm: null, lastSheetPolicy: null, marginTiers: [], quantities: [], roundTo: null, engravePct: {} };

/** Thông số còn thiếu của phần TẤM (rộng, cao, giá, lề, khoảng cách, công nghệ). */
export function materialMissing(stock: MaterialStock, config: QuoteConfig): MissingParam[] {
  return findMissing({ material: stock, machine: null, config, engraveLevel: "KHONG_KHAC", quantities: [] }).filter((m) => m.scope === "material");
}

/** Thông số còn thiếu của MÁY cho một công nghệ (kể cả tốc độ khắc). Có mã "machine" nghĩa là chưa có dòng nào cho công nghệ đó. */
export function machineMissing(technique: string, profile: MachineParams | null): MissingParam[] {
  const dummy: MaterialStock = { stockWidthMm: 1, stockHeightMm: 1, stockPrice: 1, edgeMarginMm: 0, gapMm: 0, allowRotate: true, technique };
  return findMissing({ material: dummy, machine: profile, config: EMPTY_CONFIG, engraveLevel: "IT", quantities: [] }).filter((m) => m.scope === "machine");
}

/**
 * ok: đủ. partial: đủ để báo giá chỉ cắt, thiếu tốc độ khắc. missing: thiếu thông số bắt buộc. none: chưa có dòng thông số máy nào.
 */
export type MachineState = "ok" | "partial" | "missing" | "none";

export function machineState(missing: MissingParam[]): MachineState {
  if (missing.length === 0) return "ok";
  if (missing.some((m) => m.code === "machine")) return "none";
  if (missing.every((m) => m.code === "engraveSpeedMm2PerSec")) return "partial";
  return "missing";
}

export const MACHINE_STATE_LABEL: Record<MachineState, string> = {
  ok: "Đủ",
  partial: "Thiếu tốc độ khắc",
  missing: "Còn thiếu",
  none: "Chưa có dữ liệu",
};

/** Nhãn ngắn của thông số tấm còn thiếu (hiện trong bảng). */
export const MATERIAL_MISSING_SHORT: Record<string, string> = {
  stockWidthMm: "rộng tấm",
  stockHeightMm: "cao tấm",
  stockPrice: "giá tấm",
  edgeMarginMm: "lề tấm",
  gapMm: "khoảng cách",
  technique: "công nghệ",
};

/** Mã thiếu dùng để lọc bảng tấm (thứ tự hiển thị trong ô chọn). */
export const MATERIAL_MISSING_CODES = ["stockWidthMm", "stockHeightMm", "stockPrice", "edgeMarginMm", "gapMm", "technique"] as const;

export type CheckState = "ok" | "missing";
export type ConfigCheck = { code: string; label: string; state: CheckState; detail: string };

/**
 * Kiểm tra cấu hình chung. `materialsWithoutGap` = số chất liệu đang bật chưa có khoảng cách riêng
 * (khoảng cách mặc định chỉ bắt buộc khi còn chất liệu như vậy).
 */
export function configChecks(config: QuoteConfig, materialsWithoutGap: number): ConfigCheck[] {
  const out: ConfigCheck[] = [];

  if (config.defaultGapMm !== null) out.push({ code: "defaultGapMm", label: "Khoảng cách mặc định giữa logo", state: "ok", detail: `${groupDigits(config.defaultGapMm)} mm` });
  else if (materialsWithoutGap === 0) out.push({ code: "defaultGapMm", label: "Khoảng cách mặc định giữa logo", state: "ok", detail: "Chưa đặt, nhưng mọi chất liệu đang bật đã có khoảng cách riêng." });
  else out.push({ code: "defaultGapMm", label: "Khoảng cách mặc định giữa logo", state: "missing", detail: `Chưa đặt; còn ${materialsWithoutGap} chất liệu chưa có khoảng cách riêng.` });

  out.push(
    config.lastSheetPolicy === null
      ? { code: "lastSheetPolicy", label: "Chính sách tính tấm cuối", state: "missing", detail: "Chưa chọn." }
      : { code: "lastSheetPolicy", label: "Chính sách tính tấm cuối", state: "ok", detail: config.lastSheetPolicy === "WHOLE_SHEET" ? "Tính cả tấm cuối" : "Tính theo phần dùng của tấm cuối" },
  );

  out.push(
    config.roundTo === null
      ? { code: "roundTo", label: "Làm tròn đơn giá", state: "missing", detail: "Chưa đặt." }
      : { code: "roundTo", label: "Làm tròn đơn giá", state: "ok", detail: `Tới ${groupDigits(config.roundTo)} đ` },
  );

  out.push(
    config.quantities.length === 0
      ? { code: "quantities", label: "Các mốc số lượng hiển thị", state: "missing", detail: "Chưa nhập mốc nào." }
      : { code: "quantities", label: "Các mốc số lượng hiển thị", state: "ok", detail: config.quantities.map((q) => groupDigits(q)).join(", ") },
  );

  if (config.marginTiers.length === 0) {
    out.push({ code: "marginTiers", label: "Bảng lãi cộng thêm trên giá vốn", state: "missing", detail: "Chưa có bậc nào." });
  } else {
    const uncovered = config.quantities.filter((q) => markupFor(config.marginTiers, q) === null);
    out.push(
      uncovered.length > 0
        ? { code: "marginTiers", label: "Bảng lãi cộng thêm trên giá vốn", state: "missing", detail: `Chưa có bậc lãi cho số lượng: ${uncovered.map((q) => groupDigits(q)).join(", ")}.` }
        : { code: "marginTiers", label: "Bảng lãi cộng thêm trên giá vốn", state: "ok", detail: `${config.marginTiers.length} bậc` },
    );
  }

  for (const [level, name] of [["IT", "Khắc ít"], ["VUA", "Khắc vừa"], ["NHIEU", "Khắc nhiều"]] as const) {
    const v = config.engravePct[level];
    out.push(
      v === null || v === undefined
        ? { code: `engrave:${level}`, label: `% diện tích khắc, mức "${name}"`, state: "missing", detail: "Chưa nhập." }
        : { code: `engrave:${level}`, label: `% diện tích khắc, mức "${name}"`, state: "ok", detail: `${groupDigits(v)}% diện tích logo` },
    );
  }
  return out;
}
