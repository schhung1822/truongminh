import { ENGRAVE_LEVEL_LABEL, type EngraveLevel, type MachineParams, type MaterialStock, type MissingParam, type QuoteConfig } from "./types";
import { engraveShare, markupFor } from "./config";

const miss = (code: string, label: string, scope: MissingParam["scope"], hint: string): MissingParam => ({ code, label, scope, hint });
const has = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

export type MissingInput = {
  material: MaterialStock;
  /** thông số máy của công nghệ chất liệu; null = chưa có dòng nào cho công nghệ đó */
  machine: MachineParams | null;
  config: QuoteConfig;
  engraveLevel: EngraveLevel;
  quantities: number[];
};

/**
 * Liệt kê mọi thông số còn thiếu để tính giá. Rỗng nghĩa là đủ để ra giá.
 * Không có giá trị mặc định nào được tự đặt: thiếu là phải báo.
 */
export function findMissing(i: MissingInput): MissingParam[] {
  const out: MissingParam[] = [];
  const m = i.material;
  const mat = "Quản trị > Chất liệu (mục Tấm vật liệu)";
  const mach = "Quản trị > Báo giá > Thông số máy";
  const cfgHint = "Quản trị > Báo giá > Cấu hình giá";

  if (!has(m.stockWidthMm) || m.stockWidthMm <= 0) out.push(miss("stockWidthMm", "Chiều rộng tấm", "material", mat));
  if (!has(m.stockHeightMm) || m.stockHeightMm <= 0) out.push(miss("stockHeightMm", "Chiều cao tấm", "material", mat));
  if (!has(m.stockPrice) || m.stockPrice <= 0) out.push(miss("stockPrice", "Giá một tấm", "material", mat));
  if (!has(m.edgeMarginMm) || m.edgeMarginMm < 0) out.push(miss("edgeMarginMm", "Lề tấm", "material", mat));
  if (!has(m.gapMm) && !has(i.config.defaultGapMm)) {
    out.push(miss("gapMm", "Khoảng cách giữa các logo (của chất liệu hoặc mặc định chung)", "material", `${mat} hoặc ${cfgHint}`));
  }
  if (!m.technique) out.push(miss("technique", "Công nghệ của chất liệu (để lấy thông số máy)", "material", "Quản trị > Chất liệu > phân loại"));

  if (m.technique) {
    const p = i.machine;
    if (!p) {
      out.push(miss("machine", `Thông số máy cho công nghệ "${m.technique}"`, "machine", mach));
    } else {
      if (!has(p.cutSpeedMmPerSec) || p.cutSpeedMmPerSec <= 0) out.push(miss("cutSpeedMmPerSec", "Tốc độ cắt (mm/giây)", "machine", mach));
      if (!has(p.setupMinutesPerJob) || p.setupMinutesPerJob < 0) out.push(miss("setupMinutesPerJob", "Thời gian cài đặt mỗi đơn (phút)", "machine", mach));
      if (!has(p.sheetChangeMinutes) || p.sheetChangeMinutes < 0) out.push(miss("sheetChangeMinutes", "Thời gian đổi tấm (phút)", "machine", mach));
      if (!has(p.machineCostPerHour) || p.machineCostPerHour < 0) out.push(miss("machineCostPerHour", "Chi phí máy mỗi giờ", "machine", mach));
      if (!has(p.laborSecondsPerPiece) || p.laborSecondsPerPiece < 0) out.push(miss("laborSecondsPerPiece", "Công mỗi sản phẩm (giây)", "machine", mach));
      if (!has(p.laborCostPerHour) || p.laborCostPerHour < 0) out.push(miss("laborCostPerHour", "Chi phí công mỗi giờ", "machine", mach));
      if (i.engraveLevel !== "KHONG_KHAC" && (!has(p.engraveSpeedMm2PerSec) || p.engraveSpeedMm2PerSec <= 0)) {
        out.push(miss("engraveSpeedMm2PerSec", "Tốc độ khắc (mm2/giây)", "machine", mach));
      }
    }
  }

  const c = i.config;
  if (c.lastSheetPolicy === null) out.push(miss("lastSheetPolicy", "Chính sách tính tấm cuối", "config", cfgHint));
  if (c.roundTo === null) out.push(miss("roundTo", "Làm tròn giá tới (đồng)", "config", cfgHint));
  if (c.marginTiers.length === 0) {
    out.push(miss("marginTiers", "Bảng lãi cộng thêm theo bậc số lượng", "config", cfgHint));
  } else {
    for (const q of i.quantities) {
      if (markupFor(c.marginTiers, q) === null) out.push(miss(`markup:${q}`, `Bậc lãi cho số lượng ${q}`, "config", cfgHint));
    }
  }
  if (i.quantities.length === 0) out.push(miss("quantities", "Các mốc số lượng", "config", cfgHint));
  if (i.engraveLevel !== "KHONG_KHAC" && engraveShare(c, i.engraveLevel) === null) {
    out.push(miss(`engrave:${i.engraveLevel}`, `Tỉ lệ diện tích khắc của mức "${ENGRAVE_LEVEL_LABEL[i.engraveLevel]}" (% diện tích logo)`, "config", cfgHint));
  }
  return out;
}

export const MISSING_MESSAGE = "Thiếu thông số, chưa tính được giá";
