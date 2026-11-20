import { nest, type LogoContour, type NestingInput, type NestingResult } from "@/lib/nesting";
import { engraveShare, markupFor } from "./config";
import { findMissing } from "./missing";
import { priceLine } from "./price";
import type { EngraveLevel, LogoMeasure, MachineParams, MaterialStock, MissingParam, QuoteConfig, QuoteLineFull } from "./types";

export type QuoteInput = {
  material: MaterialStock;
  machine: MachineParams | null;
  config: QuoteConfig;
  logo: LogoMeasure;
  /** đường viền thật của logo (nếu có) để xếp so le */
  contour?: LogoContour;
  engraveLevel: EngraveLevel;
  /** các mốc số lượng; mặc định lấy từ cấu hình */
  quantities?: number[];
};

/** Thông số đã dùng lúc tính (CHỈ ADMIN): lưu kèm báo giá để về sau biết giá này tính từ số nào. */
export type ParamsSnapshot = {
  material: MaterialStock;
  machine: MachineParams;
  config: QuoteConfig;
  engraveSharePct: number;
};

export type QuoteComputation =
  | {
      ok: true;
      nesting: NestingResult;
      perSheet: number;
      efficiencyPct: number;
      stock: { widthMm: number; heightMm: number; edgeMarginMm: number; gapMm: number };
      lines: QuoteLineFull[];
      params: ParamsSnapshot;
      warnings: string[];
    }
  | { ok: false; reason: "MISSING"; missing: MissingParam[] }
  | { ok: false; reason: "NESTING"; error: string; nesting: NestingResult };

/**
 * Tính báo giá: kiểm tra thông số, xếp logo lên tấm, rồi tính giá từng mốc số lượng.
 * Thiếu thông số thì KHÔNG ra giá (trả về danh sách thiếu). Không xếp được logo nào thì báo lỗi của bộ xếp hình.
 */
export function computeQuote(input: QuoteInput): QuoteComputation {
  const quantities = [...new Set(input.quantities ?? input.config.quantities)].filter((q) => Number.isInteger(q) && q >= 1).sort((a, b) => a - b);
  const missing = findMissing({ material: input.material, machine: input.machine, config: input.config, engraveLevel: input.engraveLevel, quantities });
  if (input.logo.perimeterMm <= 0 || input.logo.areaMm2 <= 0 || !(input.logo.widthMm > 0) || !(input.logo.heightMm > 0)) {
    missing.push({ code: "logo", label: "Kích thước logo", scope: "logo", hint: "Nhập chiều rộng logo" });
  }
  if (missing.length > 0) return { ok: false, reason: "MISSING", missing };

  const m = input.material;
  const gapMm = (m.gapMm ?? input.config.defaultGapMm) as number;
  const nestInput: NestingInput = {
    stockWidthMm: m.stockWidthMm as number,
    stockHeightMm: m.stockHeightMm as number,
    edgeMarginMm: m.edgeMarginMm as number,
    gapMm,
    logoWidthMm: input.logo.widthMm,
    logoHeightMm: input.logo.heightMm,
    allowRotate: m.allowRotate,
    contour: input.contour,
    logoAreaMm2: input.logo.areaMm2,
  };
  const nesting = nest(nestInput);
  if (nesting.count === 0) return { ok: false, reason: "NESTING", error: nesting.error ?? "Không xếp được logo nào lên tấm.", nesting };

  const share = engraveShare(input.config, input.engraveLevel) as number;
  const lines = quantities.map((quantity) =>
    priceLine({
      quantity,
      perSheet: nesting.count,
      stockPrice: m.stockPrice as number,
      policy: input.config.lastSheetPolicy!,
      machine: input.machine as MachineParams,
      logo: input.logo,
      engraveSharePct: share,
      markupPct: markupFor(input.config.marginTiers, quantity) as number,
      roundTo: input.config.roundTo as number,
    }),
  );

  return {
    ok: true,
    nesting,
    perSheet: nesting.count,
    efficiencyPct: nesting.efficiencyPct,
    stock: { widthMm: m.stockWidthMm as number, heightMm: m.stockHeightMm as number, edgeMarginMm: m.edgeMarginMm as number, gapMm },
    lines,
    params: { material: m, machine: input.machine as MachineParams, config: input.config, engraveSharePct: share },
    warnings: nesting.warnings,
  };
}
