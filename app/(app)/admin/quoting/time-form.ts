import { numToText } from "./format";
import { parseGrouped, parsePlain, type Parsed } from "./parse";

/**
 * Form ghi thời gian máy thực tế của một đơn đã làm (thuần, có test).
 * Đơn vị: chiều dài cắt mm, diện tích khắc mm2, thời gian phút. Số lớn gõ được "12.500".
 */

export type TimeRaw = {
  description: string;
  technique: string;
  totalCutMm: string;
  engraveAreaMm2: string;
  sheets: string;
  actualMinutes: string;
  /** mã báo giá nếu số liệu được điền sẵn từ một báo giá */
  quoteId: string;
};

export type TimeInput = {
  description: string;
  technique: string;
  totalCutMm: number;
  engraveAreaMm2: number;
  sheets: number;
  actualMinutes: number;
  quoteId: string | null;
};

export const emptyTimeRaw = (): TimeRaw => ({ description: "", technique: "", totalCutMm: "", engraveAreaMm2: "", sheets: "", actualMinutes: "", quoteId: "" });

const num = (p: Parsed): number | null => (typeof p === "number" ? p : null);

export function timeRawToInput(raw: TimeRaw): { ok: true; input: TimeInput } | { error: string } {
  const description = raw.description.trim();
  if (!description) return { error: "Vui lòng nhập mô tả đơn (ví dụ tên khách và chất liệu)." };
  if (description.length > 300) return { error: "Mô tả tối đa 300 ký tự." };
  const technique = raw.technique.trim();
  if (!technique) return { error: "Vui lòng chọn công nghệ." };
  if (technique.length > 60) return { error: "Công nghệ tối đa 60 ký tự." };

  const cut = raw.totalCutMm.trim() === "" ? 0 : parseGrouped(raw.totalCutMm);
  if (cut === "invalid") return { error: "Tổng chiều dài cắt (mm) không phải số hợp lệ." };
  const engrave = raw.engraveAreaMm2.trim() === "" ? 0 : parseGrouped(raw.engraveAreaMm2);
  if (engrave === "invalid") return { error: "Diện tích khắc (mm2) không phải số hợp lệ." };
  const sheets = parseGrouped(raw.sheets);
  if (sheets === "invalid") return { error: "Số tấm không phải số hợp lệ." };
  const minutes = parsePlain(raw.actualMinutes);
  if (minutes === "invalid") return { error: "Thời gian thực tế (phút) không phải số hợp lệ." };

  const c = num(cut) ?? 0;
  const e = num(engrave) ?? 0;
  if (c < 0 || e < 0) return { error: "Chiều dài cắt và diện tích khắc không được âm." };
  if (c > 1e9) return { error: "Tổng chiều dài cắt quá lớn (tối đa 1.000.000.000 mm)." };
  if (e > 1e12) return { error: "Diện tích khắc quá lớn." };
  if (c === 0 && e === 0) return { error: "Cần ít nhất một trong hai: tổng chiều dài cắt hoặc diện tích khắc lớn hơn 0." };
  if (sheets === null || !Number.isInteger(sheets) || sheets < 1 || sheets > 100_000) return { error: "Số tấm phải là số nguyên từ 1 đến 100.000." };
  if (minutes === null || minutes <= 0) return { error: "Thời gian thực tế phải lớn hơn 0 phút." };
  if (minutes > 100_000) return { error: "Thời gian thực tế quá lớn (tối đa 100.000 phút)." };
  const quoteId = raw.quoteId.trim();
  if (quoteId.length > 40) return { error: "Mã báo giá không hợp lệ." };

  return { ok: true, input: { description, technique, totalCutMm: c, engraveAreaMm2: e, sheets, actualMinutes: minutes, quoteId: quoteId || null } };
}

/** Số liệu điền sẵn từ báo giá (timeLogDefaultsFromQuote) → ô nhập. Số lẻ làm tròn 1 chữ số thập phân cho dễ nhìn. */
export function defaultsToRaw(d: { technique: string; totalCutMm: number; engraveAreaMm2: number; sheets: number; description: string }): Pick<TimeRaw, "technique" | "totalCutMm" | "engraveAreaMm2" | "sheets" | "description"> {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    technique: d.technique,
    description: d.description,
    totalCutMm: numToText(r1(d.totalCutMm), 1),
    engraveAreaMm2: numToText(r1(d.engraveAreaMm2), 1),
    sheets: String(d.sheets),
  };
}
