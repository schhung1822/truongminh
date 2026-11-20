import { describe, expect, it } from "vitest";
import { machineProfileSchema } from "@/lib/quoting/schemas";
import type { QuoteConfig } from "@/lib/quoting/types";
import { CALIBRATION_KEYS, isCalibrationKey, mergeCalibration, roundSuggestion } from "./calibration-form";
import { MACHINE_FIELDS, emptyMachineRaw, machineRawToInput, machineToRaw, sameMachineRaw } from "./machine-form";
import { checkTierRows, configToRaw, parseQuantityList, settingsRawToInput, uncoveredQuantities, type SettingsRaw } from "./settings-input";
import { sameRaw, stockRawToInput, stockToRaw, type StockRaw } from "./stock-form";
import { defaultsToRaw, emptyTimeRaw, timeRawToInput, type TimeRaw } from "./time-form";

/* ---------- Tấm vật liệu ---------- */

describe("stock-form", () => {
  const full = { stockWidthMm: 600, stockHeightMm: 400, stockPrice: 1500000, edgeMarginMm: 5, gapMm: null, allowRotate: true };

  it("giá trị lưu (mm, đồng) → ô nhập (cm, mm, đồng có dấu chấm)", () => {
    expect(stockToRaw(full)).toEqual({ widthCm: "60", heightCm: "40", price: "1.500.000", edgeMarginMm: "5", gapMm: "", allowRotate: true });
  });
  it("trống giữ trống, không điền số mặc định nào", () => {
    const r = stockToRaw({ stockWidthMm: null, stockHeightMm: null, stockPrice: null, edgeMarginMm: null, gapMm: null, allowRotate: false });
    expect(r).toEqual({ widthCm: "", heightCm: "", price: "", edgeMarginMm: "", gapMm: "", allowRotate: false });
  });
  it("đi một vòng không đổi giá trị", () => {
    const back = stockRawToInput(stockToRaw(full));
    expect(back).toEqual({ ok: true, input: { stockWidthMm: 600, stockHeightMm: 400, stockPrice: 1500000, edgeMarginMm: 5, gapMm: null, allowRotate: true } });
  });
  it("ô trống hết = null hết (chưa có dữ liệu)", () => {
    const r = stockRawToInput({ widthCm: "", heightCm: "", price: "", edgeMarginMm: "", gapMm: "", allowRotate: false });
    expect(r).toEqual({ ok: true, input: { stockWidthMm: null, stockHeightMm: null, stockPrice: null, edgeMarginMm: null, gapMm: null, allowRotate: false } });
  });
  it("cm sang mm không sinh sai số", () => {
    const r = stockRawToInput({ widthCm: "59,9999", heightCm: "1,1", price: "120.000", edgeMarginMm: "2,5", gapMm: "3", allowRotate: true });
    expect(r).toEqual({ ok: true, input: { stockWidthMm: 599.999, stockHeightMm: 11, stockPrice: 120000, edgeMarginMm: 2.5, gapMm: 3, allowRotate: true } });
  });
  const base: StockRaw = { widthCm: "60", heightCm: "40", price: "100.000", edgeMarginMm: "5", gapMm: "", allowRotate: true };
  it("báo lỗi rõ theo ô, có đơn vị", () => {
    expect(stockRawToInput({ ...base, widthCm: "abc" })).toEqual({ error: "Rộng tấm (cm): không phải số hợp lệ." });
    expect(stockRawToInput({ ...base, price: "x" })).toEqual({ error: "Giá tấm (đồng): không phải số hợp lệ." });
    expect(stockRawToInput({ ...base, widthCm: "10001" })).toEqual({ error: "Rộng tấm (cm): tối đa 10.000 cm." });
    expect("error" in stockRawToInput({ ...base, widthCm: "0" })).toBe(true);
    expect("error" in stockRawToInput({ ...base, price: "-5" })).toBe(true);
    expect("error" in stockRawToInput({ ...base, edgeMarginMm: "-1" })).toBe(true);
    expect("error" in stockRawToInput({ ...base, gapMm: "-1" })).toBe(true);
  });
  it("sameRaw so từng ô", () => {
    expect(sameRaw(base, { ...base })).toBe(true);
    expect(sameRaw(base, { ...base, allowRotate: false })).toBe(false);
    expect(sameRaw(base, { ...base, price: "100000" })).toBe(false);
  });
});

/* ---------- Thông số máy ---------- */

describe("machine-form", () => {
  it("các ô trùng đúng các khóa của machineProfileSchema, có đơn vị và gợi ý", () => {
    expect(MACHINE_FIELDS.map((f) => f.key).sort()).toEqual(Object.keys(machineProfileSchema.shape).sort());
    for (const f of MACHINE_FIELDS) {
      expect(f.unit.length).toBeGreaterThan(0);
      expect(f.hint.length).toBeGreaterThan(10);
    }
    expect(MACHINE_FIELDS.filter((f) => f.optional).map((f) => f.key)).toEqual(["consumableCostPerM2"]);
  });
  it("chưa có dòng thì mọi ô trống", () => {
    expect(Object.values(machineToRaw(null)).every((v) => v === "")).toBe(true);
    expect(sameMachineRaw(machineToRaw(null), emptyMachineRaw())).toBe(true);
  });
  it("giá trị lưu → ô nhập, tiền có dấu chấm", () => {
    const raw = machineToRaw({ cutSpeedMmPerSec: 20.5, machineCostPerHour: 300000, consumableCostPerM2: null });
    expect(raw.cutSpeedMmPerSec).toBe("20,5");
    expect(raw.machineCostPerHour).toBe("300.000");
    expect(raw.consumableCostPerM2).toBe("");
  });
  it("ô nhập → dữ liệu đúng schema, ô trống là null", () => {
    const r = machineRawToInput({ ...emptyMachineRaw(), cutSpeedMmPerSec: "20,5", machineCostPerHour: "300.000", laborSecondsPerPiece: "30" });
    expect(r).toEqual({
      ok: true,
      input: { cutSpeedMmPerSec: 20.5, engraveSpeedMm2PerSec: null, setupMinutesPerJob: null, sheetChangeMinutes: null, machineCostPerHour: 300000, laborSecondsPerPiece: 30, laborCostPerHour: null, consumableCostPerM2: null },
    });
  });
  it("báo lỗi rõ ô nào", () => {
    const bad = machineRawToInput({ ...emptyMachineRaw(), cutSpeedMmPerSec: "abc" });
    expect("error" in bad && bad.error).toMatch(/Tốc độ cắt/);
    const zero = machineRawToInput({ ...emptyMachineRaw(), cutSpeedMmPerSec: "0" });
    expect("error" in zero && zero.error).toMatch(/Tốc độ cắt/);
    expect("error" in machineRawToInput({ ...emptyMachineRaw(), setupMinutesPerJob: "-1" })).toBe(true);
  });
});

/* ---------- Cấu hình giá ---------- */

describe("settings-input", () => {
  const empty: SettingsRaw = { defaultGapMm: "", lastSheetPolicy: "", roundTo: "", quantities: "", engrave: { IT: "", VUA: "", NHIEU: "" }, tiers: [] };
  const full: SettingsRaw = {
    defaultGapMm: "3",
    lastSheetPolicy: "PRO_RATA",
    roundTo: "100",
    quantities: "50, 100, 200, 500, 1000",
    engrave: { IT: "10", VUA: "25,5", NHIEU: "50" },
    tiers: [
      { fromQty: "1", toQty: "99", markupPct: "40" },
      { fromQty: "100", toQty: "499", markupPct: "30" },
      { fromQty: "500", toQty: "", markupPct: "20" },
    ],
  };

  it("lần đầu mọi ô trống, không tự điền giá trị nào", () => {
    const empty0: QuoteConfig = { defaultGapMm: null, lastSheetPolicy: null, marginTiers: [], quantities: [], roundTo: null, engravePct: {} };
    expect(configToRaw(empty0)).toEqual(empty);
  });
  it("cấu hình đang lưu → ô nhập và ngược lại", () => {
    const cfg: QuoteConfig = {
      defaultGapMm: 3,
      lastSheetPolicy: "PRO_RATA",
      marginTiers: [
        { fromQty: 1, toQty: 99, markupPct: 40 },
        { fromQty: 100, toQty: null, markupPct: 30.5 },
      ],
      quantities: [50, 100],
      roundTo: 100,
      engravePct: { IT: 10, VUA: null },
    };
    const raw = configToRaw(cfg);
    expect(raw.quantities).toBe("50, 100");
    expect(raw.tiers).toEqual([
      { fromQty: "1", toQty: "99", markupPct: "40" },
      { fromQty: "100", toQty: "", markupPct: "30,5" },
    ]);
    expect(raw.engrave).toEqual({ IT: "10", VUA: "", NHIEU: "" });
    const back = settingsRawToInput(raw);
    expect("ok" in back && back.input.marginTiers).toEqual(cfg.marginTiers);
  });

  it("parseQuantityList", () => {
    expect(parseQuantityList("50, 100, 200, 500, 1000")).toEqual({ ok: true, values: [50, 100, 200, 500, 1000] });
    expect(parseQuantityList("1.000 2.000; 5000")).toEqual({ ok: true, values: [1000, 2000, 5000] });
    expect(parseQuantityList("")).toEqual({ ok: true, values: [] });
    expect("error" in parseQuantityList("50, abc")).toBe(true);
    expect("error" in parseQuantityList("0")).toBe(true);
    expect("error" in parseQuantityList("2,5x")).toBe(true);
  });

  describe("checkTierRows (lỗi đúng dòng)", () => {
    const t = (fromQty: string, toQty: string, markupPct: string) => ({ fromQty, toQty, markupPct });
    it("bảng hợp lệ", () => {
      const r = checkTierRows(full.tiers);
      expect(r.ok).toBe(true);
      expect(r.tiers).toHaveLength(3);
      expect(r.tiers[2]).toEqual({ fromQty: 500, toQty: null, markupPct: 20 });
    });
    it("dòng trống hoàn toàn bị bỏ qua", () => {
      const r = checkTierRows([t("1", "", "40"), t("", "", "")]);
      expect(r.ok).toBe(true);
      expect(r.tiers).toHaveLength(1);
    });
    it("nhập sai từng ô", () => {
      expect(checkTierRows([t("", "10", "5")]).rowErrors[0]).toMatch(/Từ SL/);
      expect(checkTierRows([t("0", "10", "5")]).rowErrors[0]).toMatch(/Từ SL/);
      expect(checkTierRows([t("1", "x", "5")]).rowErrors[0]).toMatch(/Đến SL/);
      expect(checkTierRows([t("10", "5", "5")]).rowErrors[0]).toMatch(/lớn hơn hoặc bằng/);
      expect(checkTierRows([t("1", "10", "")]).rowErrors[0]).toMatch(/lãi/);
      expect(checkTierRows([t("1", "10", "abc")]).rowErrors[0]).toMatch(/không phải số/);
      expect(checkTierRows([t("1", "10", "1001")]).rowErrors[0]).toMatch(/0 đến 1000/);
    });
    it("chồng bậc: báo ở dòng chồng", () => {
      const r = checkTierRows([t("1", "50", "40"), t("40", "99", "30")]);
      expect(r.ok).toBe(false);
      expect(r.rowErrors[0]).toBeNull();
      expect(r.rowErrors[1]).toMatch(/Chồng/);
    });
    it("hở bậc: báo đúng dòng dù các dòng không theo thứ tự", () => {
      const r = checkTierRows([t("50", "99", "30"), t("1", "40", "40")]);
      expect(r.ok).toBe(false);
      expect(r.rowErrors[0]).toMatch(/Hở bậc/);
      expect(r.rowErrors[0]).toMatch(/41/);
      expect(r.rowErrors[1]).toBeNull();
    });
    it("chỉ dòng cuối được để trống Đến SL", () => {
      const r = checkTierRows([t("1", "", "40"), t("50", "", "30")]);
      expect(r.ok).toBe(false);
      expect(r.rowErrors[0]).toMatch(/dòng cuối/);
      expect(r.rowErrors[1]).toBeNull();
    });
    it("bảng sắp xếp lại được: dòng đầu không cần là bậc thấp nhất", () => {
      const r = checkTierRows([t("50", "", "30"), t("1", "49", "40")]);
      expect(r.ok).toBe(true);
      expect(r.tiers.map((x) => x.fromQty)).toEqual([50, 1]);
    });
  });

  it("uncoveredQuantities", () => {
    const tiers = [
      { fromQty: 1, toQty: 99, markupPct: 40 },
      { fromQty: 100, toQty: 1000, markupPct: 30 },
    ];
    expect(uncoveredQuantities([50, 100, 2000], tiers)).toEqual([2000]);
    expect(uncoveredQuantities([50], [])).toEqual([]);
  });

  describe("settingsRawToInput", () => {
    it("ô trống hết vẫn hợp lệ (lưu được trạng thái chưa có dữ liệu)", () => {
      expect(settingsRawToInput(empty)).toEqual({
        ok: true,
        input: { defaultGapMm: null, lastSheetPolicy: null, marginTiers: [], displayQuantities: [], roundTo: null, engraveLevels: { IT: null, VUA: null, NHIEU: null } },
      });
    });
    it("form đầy đủ", () => {
      const r = settingsRawToInput(full);
      expect(r).toEqual({
        ok: true,
        input: {
          defaultGapMm: 3,
          lastSheetPolicy: "PRO_RATA",
          marginTiers: [
            { fromQty: 1, toQty: 99, markupPct: 40 },
            { fromQty: 100, toQty: 499, markupPct: 30 },
            { fromQty: 500, toQty: null, markupPct: 20 },
          ],
          displayQuantities: [50, 100, 200, 500, 1000],
          roundTo: 100,
          engraveLevels: { IT: 10, VUA: 25.5, NHIEU: 50 },
        },
      });
    });
    it("lỗi bậc lãi trả kèm lỗi từng dòng", () => {
      const r = settingsRawToInput({ ...full, tiers: [full.tiers[0], { fromQty: "50", toQty: "200", markupPct: "30" }] });
      expect("error" in r).toBe(true);
      if ("error" in r) {
        expect(r.error).toMatch(/dòng 2/);
        expect(r.tierErrors?.[0]).toBeNull();
        expect(r.tierErrors?.[1]).toMatch(/Chồng/);
      }
    });
    it("lỗi từng ô", () => {
      expect("error" in settingsRawToInput({ ...full, defaultGapMm: "-1" })).toBe(true);
      expect("error" in settingsRawToInput({ ...full, roundTo: "0,5" })).toBe(true);
      expect("error" in settingsRawToInput({ ...full, quantities: "50, x" })).toBe(true);
      const e = settingsRawToInput({ ...full, engrave: { IT: "150", VUA: "", NHIEU: "" } });
      expect("error" in e && e.error).toMatch(/tối đa 100/);
      expect("error" in settingsRawToInput({ ...full, lastSheetPolicy: "KHAC" as never })).toBe(true);
    });
  });
});

/* ---------- Thời gian máy thực tế ---------- */

describe("time-form", () => {
  const ok: TimeRaw = { description: "Khách A, mica 3mm", technique: "khac-laser", totalCutMm: "12.500", engraveAreaMm2: "", sheets: "2", actualMinutes: "35,5", quoteId: "abc123" };
  it("đơn hợp lệ", () => {
    expect(timeRawToInput(ok)).toEqual({ ok: true, input: { description: "Khách A, mica 3mm", technique: "khac-laser", totalCutMm: 12500, engraveAreaMm2: 0, sheets: 2, actualMinutes: 35.5, quoteId: "abc123" } });
  });
  it("mã báo giá trống là null", () => {
    const r = timeRawToInput({ ...ok, quoteId: "" });
    expect("ok" in r && r.input.quoteId).toBeNull();
  });
  it("chặn dữ liệu thiếu hoặc vô lý", () => {
    expect("error" in timeRawToInput({ ...ok, description: " " })).toBe(true);
    expect("error" in timeRawToInput({ ...ok, technique: "" })).toBe(true);
    expect("error" in timeRawToInput({ ...ok, totalCutMm: "", engraveAreaMm2: "" })).toBe(true);
    expect("error" in timeRawToInput({ ...ok, totalCutMm: "-5" })).toBe(true);
    expect("error" in timeRawToInput({ ...ok, sheets: "0" })).toBe(true);
    expect("error" in timeRawToInput({ ...ok, sheets: "1,5" })).toBe(true);
    expect("error" in timeRawToInput({ ...ok, sheets: "" })).toBe(true);
    expect("error" in timeRawToInput({ ...ok, actualMinutes: "0" })).toBe(true);
    expect("error" in timeRawToInput({ ...ok, actualMinutes: "abc" })).toBe(true);
    expect("error" in timeRawToInput({ ...ok, engraveAreaMm2: "xyz" })).toBe(true);
  });
  it("form trống ban đầu", () => {
    expect(Object.values(emptyTimeRaw()).every((v) => v === "")).toBe(true);
  });
  it("điền sẵn từ báo giá, làm tròn 1 chữ số", () => {
    const raw = defaultsToRaw({ technique: "khac-laser", totalCutMm: 1234.56, engraveAreaMm2: 0, sheets: 3, description: "A · M01 · 100 cái" });
    expect(raw).toEqual({ technique: "khac-laser", description: "A · M01 · 100 cái", totalCutMm: "1234,6", engraveAreaMm2: "0", sheets: "3" });
  });
});

/* ---------- Hiệu chỉnh ---------- */

describe("calibration-form", () => {
  it("làm tròn đề xuất 4 chữ số có nghĩa", () => {
    expect(roundSuggestion(36.28471)).toBe(36.28);
    expect(roundSuggestion(0.0123456)).toBe(0.01235);
    expect(roundSuggestion(1234.5678)).toBe(1235);
  });
  it("gộp: chỉ trường được chọn bị đổi, trường khác giữ nguyên", () => {
    const current = { cutSpeedMmPerSec: 10, engraveSpeedMm2PerSec: 5, setupMinutesPerJob: 8, machineCostPerHour: 300000, laborCostPerHour: 60000 };
    const merged = mergeCalibration(current, { cutSpeedMmPerSec: 20 });
    expect(merged.cutSpeedMmPerSec).toBe(20);
    expect(merged.engraveSpeedMm2PerSec).toBe(5);
    expect(merged.setupMinutesPerJob).toBe(8);
    expect(merged.machineCostPerHour).toBe(300000);
    expect(merged.laborCostPerHour).toBe(60000);
    expect(merged.sheetChangeMinutes).toBeNull();
    expect(merged.consumableCostPerM2).toBeNull();
    expect(Object.keys(merged).sort()).toEqual(Object.keys(machineProfileSchema.shape).sort());
  });
  it("chưa có dòng máy thì chỉ các trường được chọn có giá trị", () => {
    const merged = mergeCalibration(null, { setupMinutesPerJob: 7.5 });
    expect(Object.entries(merged).filter(([, v]) => v !== null)).toEqual([["setupMinutesPerJob", 7.5]]);
    expect(machineProfileSchema.safeParse(merged).success).toBe(true);
  });
  it("khóa hợp lệ", () => {
    expect(CALIBRATION_KEYS.every(isCalibrationKey)).toBe(true);
    expect(isCalibrationKey("machineCostPerHour")).toBe(false);
    expect(isCalibrationKey(undefined)).toBe(false);
  });
});
