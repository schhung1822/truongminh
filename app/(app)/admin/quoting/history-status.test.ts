import { describe, expect, it } from "vitest";
import type { MachineParams, MaterialStock, QuoteConfig } from "@/lib/quoting/types";
import { changeLine, formatChangeLog } from "./history-format";
import { configChecks, machineMissing, machineState, materialMissing } from "./status";

/* ---------- Lịch sử thay đổi ---------- */

describe("formatChangeLog", () => {
  it("tấm vật liệu: kích thước hiện bằng cm, giá bằng đồng", () => {
    const out = formatChangeLog("MATERIAL_STOCK", { stockWidthMm: 600, stockPrice: 100000 }, { stockWidthMm: 610, stockPrice: 120000 });
    expect(out).toEqual([
      { field: "stockWidthMm", label: "Rộng tấm", before: "60 cm", after: "61 cm" },
      { field: "stockPrice", label: "Giá một tấm", before: "100.000 đ", after: "120.000 đ" },
    ]);
  });
  it("giá trị trống hiện Chưa có dữ liệu; công tắc hiện Có/Không", () => {
    const out = formatChangeLog("MATERIAL_STOCK", { edgeMarginMm: null, gapMm: 3, allowRotate: true }, { edgeMarginMm: 5, gapMm: null, allowRotate: false });
    expect(out.map((c) => [c.label, c.before, c.after])).toEqual([
      ["Lề tấm", "Chưa có dữ liệu", "5 mm"],
      ["Khoảng cách giữa logo", "3 mm", "Chưa có dữ liệu"],
      ["Cho xoay logo", "Có", "Không"],
    ]);
  });
  it("trường chưa có trong before (lần đầu) được coi là trống", () => {
    const out = formatChangeLog("MATERIAL_STOCK", null, { stockPrice: 50000 });
    expect(out).toEqual([{ field: "stockPrice", label: "Giá một tấm", before: "Chưa có dữ liệu", after: "50.000 đ" }]);
  });
  it("thông số máy có đơn vị đúng", () => {
    const out = formatChangeLog(
      "MACHINE_PROFILE",
      { cutSpeedMmPerSec: 20, engraveSpeedMm2PerSec: null, setupMinutesPerJob: 10, laborSecondsPerPiece: 30, machineCostPerHour: 300000 },
      { cutSpeedMmPerSec: 22.5, engraveSpeedMm2PerSec: 80, setupMinutesPerJob: 12, laborSecondsPerPiece: 45, machineCostPerHour: 350000 },
    );
    expect(out.map((c) => `${c.label}: ${c.before} → ${c.after}`)).toEqual([
      "Tốc độ cắt: 20 mm/giây → 22,5 mm/giây",
      "Tốc độ khắc: Chưa có dữ liệu → 80 mm2/giây",
      "Thời gian cài đặt mỗi đơn: 10 phút → 12 phút",
      "Công mỗi sản phẩm: 30 giây → 45 giây",
      "Chi phí máy mỗi giờ: 300.000 đ → 350.000 đ",
    ]);
  });
  it("tạo dòng thông số máy mới", () => {
    const out = formatChangeLog("MACHINE_PROFILE", {}, { tao_moi: true });
    expect(out).toHaveLength(1);
    expect(out[0].before).toBe("");
    expect(changeLine(out[0])).toMatch(/Tạo dòng thông số mới/);
  });
  it("cấu hình giá: bậc lãi, chính sách, mốc số lượng, làm tròn", () => {
    const out = formatChangeLog(
      "QUOTE_SETTINGS",
      { lastSheetPolicy: null, marginTiers: [], displayQuantities: [], roundTo: null, defaultGapMm: null },
      {
        lastSheetPolicy: "PRO_RATA",
        marginTiers: [
          { fromQty: 1, toQty: 49, markupPct: 40 },
          { fromQty: 50, toQty: null, markupPct: 30.5 },
        ],
        displayQuantities: [50, 100, 1000],
        roundTo: 100,
        defaultGapMm: 3,
      },
    );
    const by = Object.fromEntries(out.map((c) => [c.field, c]));
    expect(by.lastSheetPolicy.after).toBe("Tính theo phần dùng của tấm cuối");
    expect(by.lastSheetPolicy.before).toBe("Chưa có dữ liệu");
    expect(by.marginTiers.label).toBe("Bảng lãi cộng thêm trên giá vốn");
    expect(by.marginTiers.before).toBe("Chưa có dữ liệu");
    expect(by.marginTiers.after).toBe("1 đến 49: 40%; từ 50: 30,5%");
    expect(by.displayQuantities.after).toBe("50, 100, 1.000");
    expect(by.roundTo.after).toBe("100 đ");
    expect(by.defaultGapMm.after).toBe("3 mm");
  });
  it("% khắc: tách từng mức khác nhau", () => {
    const out = formatChangeLog("QUOTE_SETTINGS", { engraveLevels: { IT: 10, VUA: null, NHIEU: 50 } }, { engraveLevels: { IT: 15, VUA: null, NHIEU: 50 } });
    expect(out).toEqual([{ field: "engraveLevels.IT", label: "Khắc ít: % diện tích khắc", before: "10% diện tích logo", after: "15% diện tích logo" }]);
  });
  it("lần đầu lưu: cụm % khắc từ rỗng sang toàn null thì không có dòng thừa", () => {
    expect(formatChangeLog("QUOTE_SETTINGS", { engraveLevels: {} }, { engraveLevels: { IT: null, VUA: null, NHIEU: null } })).toEqual([]);
  });
  it("trường lạ vẫn hiện (không mất thông tin)", () => {
    const out = formatChangeLog("MATERIAL_STOCK", { foo: 1 }, { foo: 2 });
    expect(out).toEqual([{ field: "foo", label: "foo", before: "1", after: "2" }]);
  });
  it("dữ liệu hỏng không làm vỡ", () => {
    expect(formatChangeLog("MATERIAL_STOCK", "x", null)).toEqual([]);
    expect(formatChangeLog("KHAC", { a: 1 }, { a: 2 })).toHaveLength(1);
  });
  it("changeLine", () => {
    expect(changeLine({ field: "a", label: "Rộng tấm", before: "60 cm", after: "61 cm" })).toBe("Rộng tấm: 60 cm → 61 cm");
  });
});

/* ---------- Tình trạng thông số ---------- */

const fullStock: MaterialStock = { stockWidthMm: 600, stockHeightMm: 400, stockPrice: 100000, edgeMarginMm: 5, gapMm: 3, allowRotate: true, technique: "khac-laser" };
const fullMachine: MachineParams = {
  cutSpeedMmPerSec: 20,
  engraveSpeedMm2PerSec: 80,
  setupMinutesPerJob: 10,
  sheetChangeMinutes: 2,
  machineCostPerHour: 300000,
  laborSecondsPerPiece: 30,
  laborCostPerHour: 60000,
  consumableCostPerM2: null,
};
const emptyConfig: QuoteConfig = { defaultGapMm: null, lastSheetPolicy: null, marginTiers: [], quantities: [], roundTo: null, engravePct: {} };
const fullConfig: QuoteConfig = {
  defaultGapMm: 3,
  lastSheetPolicy: "WHOLE_SHEET",
  marginTiers: [{ fromQty: 1, toQty: null, markupPct: 30 }],
  quantities: [50, 100],
  roundTo: 100,
  engravePct: { IT: 10, VUA: 25, NHIEU: 50 },
};

describe("materialMissing", () => {
  it("đủ thì không thiếu gì", () => {
    expect(materialMissing(fullStock, emptyConfig)).toEqual([]);
  });
  it("trống hết thì thiếu cả sáu mục của tấm (và chỉ phạm vi tấm)", () => {
    const m = materialMissing({ stockWidthMm: null, stockHeightMm: null, stockPrice: null, edgeMarginMm: null, gapMm: null, allowRotate: true, technique: null }, emptyConfig);
    expect(m.map((x) => x.code)).toEqual(["stockWidthMm", "stockHeightMm", "stockPrice", "edgeMarginMm", "gapMm", "technique"]);
    expect(m.every((x) => x.scope === "material")).toBe(true);
  });
  it("khoảng cách mặc định chung đủ thay cho khoảng cách riêng", () => {
    const stock = { ...fullStock, gapMm: null };
    expect(materialMissing(stock, emptyConfig).map((x) => x.code)).toEqual(["gapMm"]);
    expect(materialMissing(stock, { ...emptyConfig, defaultGapMm: 3 })).toEqual([]);
  });
  it("không báo thông số máy là thiếu của tấm", () => {
    expect(materialMissing(fullStock, emptyConfig).some((x) => x.scope === "machine")).toBe(false);
  });
});

describe("machineMissing và machineState", () => {
  it("chưa có dòng máy: none", () => {
    const m = machineMissing("khac-laser", null);
    expect(m.map((x) => x.code)).toEqual(["machine"]);
    expect(machineState(m)).toBe("none");
  });
  it("đủ: ok", () => {
    expect(machineMissing("khac-laser", fullMachine)).toEqual([]);
    expect(machineState([])).toBe("ok");
  });
  it("chỉ thiếu tốc độ khắc: partial", () => {
    const m = machineMissing("khac-laser", { ...fullMachine, engraveSpeedMm2PerSec: null });
    expect(m.map((x) => x.code)).toEqual(["engraveSpeedMm2PerSec"]);
    expect(machineState(m)).toBe("partial");
  });
  it("thiếu thông số bắt buộc: missing; vật tư theo m2 là tùy chọn", () => {
    const m = machineMissing("khac-laser", { ...fullMachine, cutSpeedMmPerSec: null, laborCostPerHour: null });
    expect(m.map((x) => x.code)).toEqual(["cutSpeedMmPerSec", "laborCostPerHour"]);
    expect(machineState(m)).toBe("missing");
    expect(machineMissing("khac-laser", { ...fullMachine, consumableCostPerM2: null })).toEqual([]);
  });
});

describe("configChecks", () => {
  it("cấu hình trống: mọi mục thiếu, kể cả khoảng cách mặc định khi còn chất liệu chưa có khoảng cách", () => {
    const c = configChecks(emptyConfig, 3);
    expect(c.every((x) => x.state === "missing")).toBe(true);
    expect(c.map((x) => x.code)).toEqual(["defaultGapMm", "lastSheetPolicy", "roundTo", "quantities", "marginTiers", "engrave:IT", "engrave:VUA", "engrave:NHIEU"]);
    expect(c[0].detail).toMatch(/3 chất liệu/);
  });
  it("không cần khoảng cách mặc định khi mọi chất liệu đã có khoảng cách riêng", () => {
    expect(configChecks(emptyConfig, 0)[0].state).toBe("ok");
  });
  it("cấu hình đủ", () => {
    const c = configChecks(fullConfig, 5);
    expect(c.every((x) => x.state === "ok")).toBe(true);
    expect(c.find((x) => x.code === "quantities")?.detail).toBe("50, 100");
    expect(c.find((x) => x.code === "marginTiers")?.detail).toBe("1 bậc");
  });
  it("mốc số lượng chưa có bậc lãi phủ tới thì báo thiếu", () => {
    const c = configChecks({ ...fullConfig, marginTiers: [{ fromQty: 1, toQty: 99, markupPct: 30 }] }, 0);
    const tiers = c.find((x) => x.code === "marginTiers");
    expect(tiers?.state).toBe("missing");
    expect(tiers?.detail).toMatch(/100/);
  });
});
