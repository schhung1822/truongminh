import type { CostBreakdown, LastSheetPolicy, LogoMeasure, MachineParams, QuoteLineFull } from "./types";

/**
 * Công thức giá cho MỘT mốc số lượng (thuần). Các tham số đã được kiểm tra đủ (xem findMissing) trước khi gọi.
 *
 *   sheetsNeeded   = ceil(qty / perSheet)
 *   materialCost   = WHOLE_SHEET: sheetsNeeded x giá tấm        | PRO_RATA: giá tấm x qty / perSheet
 *   machineMinutes = cài đặt + sheetsNeeded x đổi tấm + (chu vi x qty / tốc độ cắt)/60 + (diện tích khắc x qty / tốc độ khắc)/60
 *   machineCost    = machineMinutes / 60 x chi phí máy mỗi giờ
 *   laborCost      = qty x giây công mỗi sản phẩm / 3600 x chi phí công mỗi giờ
 *   consumableCost = diện tích logo (m2) x qty x chi phí vật tư mỗi m2 (nếu có)
 *   unitCost       = (materialCost + machineCost + laborCost + consumableCost) / qty
 *   unitPrice      = làm tròn(unitCost x (1 + lãi% của bậc số lượng))
 *   totalPrice     = unitPrice x qty
 *
 * Kiểm tra tay (xem price.test.ts): giá tấm 120.000đ, 54 logo/tấm, qty 100, chu vi 200mm, tốc độ cắt 20mm/s,
 * cài đặt 10 phút, đổi tấm 2 phút, máy 300.000đ/giờ, công 30 giây x 60.000đ/giờ, lãi 30%, làm tròn 100đ:
 *   sheets = ceil(100/54) = 2; vật liệu (cả tấm) = 240.000
 *   phút máy = 10 + 2x2 + (200x100/20)/60 = 10 + 4 + 16,6667 = 30,6667; tiền máy = 30,6667/60 x 300.000 = 153.333,33
 *   công = 100 x 30/3600 x 60.000 = 50.000
 *   giá vốn = 443.333,33; mỗi cái 4.433,33; x1,3 = 5.763,33; làm tròn 100đ = 5.800; thành tiền 580.000
 */

export type PriceInput = {
  quantity: number;
  perSheet: number;
  stockPrice: number;
  policy: LastSheetPolicy;
  machine: MachineParams;
  logo: LogoMeasure;
  /** % diện tích logo được khắc (0 nếu không khắc) */
  engraveSharePct: number;
  markupPct: number;
  roundTo: number;
};

export function roundPrice(value: number, roundTo: number): number {
  const r = Math.round(value / roundTo) * roundTo;
  return Math.max(roundTo, r);
}

export function priceLine(i: PriceInput): QuoteLineFull {
  const { quantity: qty, perSheet } = i;
  const m = i.machine;
  const sheetsNeeded = Math.ceil(qty / perSheet);
  const materialCost = i.policy === "WHOLE_SHEET" ? sheetsNeeded * i.stockPrice : (i.stockPrice * qty) / perSheet;

  const cutMinutes = (i.logo.perimeterMm * qty) / (m.cutSpeedMmPerSec as number) / 60;
  const engraveArea = (i.logo.areaMm2 * i.engraveSharePct) / 100;
  const engraveMinutes = engraveArea > 0 ? (engraveArea * qty) / (m.engraveSpeedMm2PerSec as number) / 60 : 0;
  const machineMinutes = (m.setupMinutesPerJob as number) + sheetsNeeded * (m.sheetChangeMinutes as number) + cutMinutes + engraveMinutes;

  const machineCost = (machineMinutes / 60) * (m.machineCostPerHour as number);
  const laborCost = ((qty * (m.laborSecondsPerPiece as number)) / 3600) * (m.laborCostPerHour as number);
  const consumableCost = m.consumableCostPerM2 ? (i.logo.areaMm2 / 1e6) * qty * m.consumableCostPerM2 : 0;

  const totalCost = materialCost + machineCost + laborCost + consumableCost;
  const unitCost = totalCost / qty;
  const unitPriceRaw = unitCost * (1 + i.markupPct / 100);
  const unitPrice = roundPrice(unitPriceRaw, i.roundTo);

  const cost: CostBreakdown = { materialCost, machineCost, laborCost, consumableCost, totalCost, unitCost, markupPct: i.markupPct, unitPriceRaw };
  return { quantity: qty, sheetsNeeded, machineMinutes, unitPrice, totalPrice: unitPrice * qty, cost };
}

/** Chiều dài cắt và diện tích khắc của cả lô (để ghi thời gian máy thực tế và hiệu chỉnh). */
export function jobTotals(logo: LogoMeasure, qty: number, engraveSharePct: number): { totalCutMm: number; engraveAreaMm2: number } {
  return { totalCutMm: logo.perimeterMm * qty, engraveAreaMm2: ((logo.areaMm2 * engraveSharePct) / 100) * qty };
}
