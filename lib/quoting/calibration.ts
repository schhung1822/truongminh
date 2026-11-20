/**
 * Hiệu chỉnh thông số máy từ thời gian thực tế (thuần, có test).
 * Mô hình: phút = setup + sheetChange x số tấm + (1 / (tốc độ cắt x 60)) x chiều dài cắt + (1 / (tốc độ khắc x 60)) x diện tích khắc.
 * Hồi quy bình phương tối thiểu. Chỉ đề xuất, admin bấm "Áp dụng" mới đổi thông số.
 */

export type TimeSample = { totalCutMm: number; engraveAreaMm2: number; sheets: number; actualMinutes: number };

export const MIN_SAMPLES = 8;

export type CalibrationResult = {
  n: number;
  /** hệ số R2 (1 = khớp hoàn hảo) */
  r2: number | null;
  /** thông số đề xuất; trường nào không ước lượng được hoặc vô lý thì để null */
  suggested: {
    setupMinutesPerJob: number | null;
    sheetChangeMinutes: number | null;
    cutSpeedMmPerSec: number | null;
    engraveSpeedMm2PerSec: number | null;
  };
  warnings: string[];
};

/** Giải hệ phương trình tuyến tính bằng khử Gauss có chọn trụ. Trả về null nếu suy biến. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = c + 1; r < n; r++) {
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r][n];
    for (let k = r + 1; k < n; k++) s -= m[r][k] * x[k];
    x[r] = s / m[r][r];
  }
  return x;
}

export function calibrate(samples: TimeSample[]): CalibrationResult {
  const warnings: string[] = [];
  const empty: CalibrationResult["suggested"] = { setupMinutesPerJob: null, sheetChangeMinutes: null, cutSpeedMmPerSec: null, engraveSpeedMm2PerSec: null };
  const data = samples.filter((s) => [s.totalCutMm, s.engraveAreaMm2, s.sheets, s.actualMinutes].every(Number.isFinite) && s.actualMinutes > 0);
  const n = data.length;
  if (n < MIN_SAMPLES) {
    return { n, r2: null, suggested: empty, warnings: [`Mới có ${n} đơn có đủ số liệu, cần ít nhất ${MIN_SAMPLES} đơn để hiệu chỉnh đáng tin.`] };
  }

  // chỉ đưa vào mô hình các biến có biến thiên (cột toàn 0 hoặc không đổi thì không ước lượng được)
  const columns: { key: "cut" | "engrave" | "sheets"; get: (s: TimeSample) => number }[] = [
    { key: "cut", get: (s) => s.totalCutMm },
    { key: "engrave", get: (s) => s.engraveAreaMm2 },
    { key: "sheets", get: (s) => s.sheets },
  ];
  const used = columns.filter((c) => {
    const v = data.map(c.get);
    return Math.max(...v) - Math.min(...v) > 1e-9;
  });
  for (const c of columns) {
    if (!used.includes(c)) {
      warnings.push(c.key === "cut" ? "Chiều dài cắt không đổi giữa các đơn nên không ước lượng được tốc độ cắt." : c.key === "engrave" ? "Chưa có đơn nào có khắc (hoặc diện tích khắc không đổi) nên không ước lượng được tốc độ khắc." : "Số tấm không đổi giữa các đơn nên không ước lượng được thời gian đổi tấm.");
    }
  }
  const p = used.length + 1; // cộng hệ số chặn (thời gian cài đặt)
  const X = data.map((s) => [1, ...used.map((c) => c.get(s))]);
  const y = data.map((s) => s.actualMinutes);
  const A = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => X.reduce((sum, row) => sum + row[i] * row[j], 0)));
  const B = Array.from({ length: p }, (_, i) => X.reduce((sum, row, k) => sum + row[i] * y[k], 0));
  const beta = solve(A, B);
  if (!beta) {
    warnings.push("Số liệu các đơn quá giống nhau (các cột phụ thuộc lẫn nhau), chưa tách được từng thông số. Cần thêm đơn đa dạng hơn.");
    return { n, r2: null, suggested: empty, warnings };
  }

  const mean = y.reduce((a, b) => a + b, 0) / n;
  const ssTot = y.reduce((s, v) => s + (v - mean) ** 2, 0);
  const ssRes = y.reduce((s, v, k) => s + (v - X[k].reduce((acc, xv, j) => acc + xv * beta[j], 0)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : null;

  const suggested = { ...empty };
  const setup = beta[0];
  if (setup >= 0) suggested.setupMinutesPerJob = setup;
  else warnings.push("Thời gian cài đặt ước lượng ra số âm, bỏ qua.");
  used.forEach((c, i) => {
    const coef = beta[i + 1];
    if (!(coef > 0)) {
      warnings.push(`Hệ số của ${c.key === "cut" ? "cắt" : c.key === "engrave" ? "khắc" : "đổi tấm"} ước lượng ra không dương, bỏ qua (số liệu chưa đủ tốt).`);
      return;
    }
    if (c.key === "cut") suggested.cutSpeedMmPerSec = 1 / (coef * 60);
    else if (c.key === "engrave") suggested.engraveSpeedMm2PerSec = 1 / (coef * 60);
    else suggested.sheetChangeMinutes = coef;
  });
  if (r2 !== null && r2 < 0.8) warnings.push(`Độ khớp thấp (R2 = ${r2.toFixed(2)}): thời gian thực tế còn phụ thuộc yếu tố khác ngoài chiều dài cắt, diện tích khắc và số tấm.`);
  return { n, r2, suggested, warnings };
}
