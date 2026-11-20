import { describe, expect, it } from "vitest";
import { calibrate, MIN_SAMPLES } from "./calibration";
import { markupFor, parseMarginTiers, parseQuoteConfig, validateMarginTiers } from "./config";
import { findMissing } from "./missing";
import { jobTotals, priceLine, roundPrice } from "./price";
import { computeQuote, type QuoteInput } from "./quote";
import { suggestSizes } from "./suggest";
import { customerPriceText, toAdminView, toSaleView } from "./view";
import type { MachineParams, MaterialStock, QuoteConfig } from "./types";

/** Bộ số GIẢ ĐỊNH chỉ để kiểm tra công thức, không phải số của xưởng. */
const material: MaterialStock = { stockWidthMm: 600, stockHeightMm: 400, stockPrice: 120_000, edgeMarginMm: 0, gapMm: 15, allowRotate: true, technique: "cat-laser" };
const machine: MachineParams = {
  cutSpeedMmPerSec: 20,
  engraveSpeedMm2PerSec: 10,
  setupMinutesPerJob: 10,
  sheetChangeMinutes: 2,
  machineCostPerHour: 300_000,
  laborSecondsPerPiece: 30,
  laborCostPerHour: 60_000,
  consumableCostPerM2: null,
};
const config: QuoteConfig = {
  defaultGapMm: 15,
  lastSheetPolicy: "WHOLE_SHEET",
  marginTiers: [
    { fromQty: 1, toQty: 99, markupPct: 40 },
    { fromQty: 100, toQty: 499, markupPct: 30 },
    { fromQty: 500, toQty: null, markupPct: 20 },
  ],
  quantities: [50, 100, 200, 500, 1000],
  roundTo: 100,
  engravePct: { IT: 10, VUA: 40, NHIEU: 80 },
};
const logo = { widthMm: 50, heightMm: 50, perimeterMm: 200, areaMm2: 1000 };

const input = (over: Partial<QuoteInput> = {}): QuoteInput => ({ material, machine, config, logo, engraveLevel: "KHONG_KHAC", ...over });

describe("công thức giá (kiểm tra tay)", () => {
  const base = { quantity: 100, perSheet: 54, stockPrice: 120_000, policy: "WHOLE_SHEET" as const, machine, logo, engraveSharePct: 0, markupPct: 30, roundTo: 100 };

  it("100 cái, tính cả tấm cuối: khớp từng bước trong chú thích của price.ts", () => {
    const l = priceLine(base);
    expect(l.sheetsNeeded).toBe(2); // ceil(100/54)
    expect(l.cost.materialCost).toBe(240_000);
    expect(l.machineMinutes).toBeCloseTo(10 + 2 * 2 + (200 * 100) / 20 / 60, 9); // 30,6667
    expect(l.machineMinutes).toBeCloseTo(30.6667, 3);
    expect(l.cost.machineCost).toBeCloseTo(153_333.33, 1);
    expect(l.cost.laborCost).toBeCloseTo(50_000, 6); // 100 x 30/3600 x 60000
    expect(l.cost.totalCost).toBeCloseTo(443_333.33, 1);
    expect(l.cost.unitCost).toBeCloseTo(4433.33, 2);
    expect(l.cost.unitPriceRaw).toBeCloseTo(5763.33, 2); // x 1,3
    expect(l.unitPrice).toBe(5800); // làm tròn 100đ
    expect(l.totalPrice).toBe(580_000);
  });

  it("tính theo phần dùng: 120.000 x 100 / 54", () => {
    const l = priceLine({ ...base, policy: "PRO_RATA" });
    expect(l.cost.materialCost).toBeCloseTo(222_222.22, 1);
    expect(l.cost.materialCost).toBeLessThan(240_000);
  });

  it("đúng số tấm khi chia hết thì cả tấm và theo phần dùng bằng nhau", () => {
    const a = priceLine({ ...base, quantity: 108 });
    const b = priceLine({ ...base, quantity: 108, policy: "PRO_RATA" });
    expect(a.sheetsNeeded).toBe(2);
    expect(a.cost.materialCost).toBeCloseTo(b.cost.materialCost, 6);
  });

  it("khắc vừa 40% diện tích 1000mm2 ở tốc độ 10mm2/s: thêm (400 x 100 / 10)/60 = 66,667 phút", () => {
    const l = priceLine({ ...base, engraveSharePct: 40 });
    expect(l.machineMinutes).toBeCloseTo(10 + 4 + 16.6667 + 66.6667, 3);
    const noEngrave = priceLine(base);
    expect(l.cost.machineCost - noEngrave.cost.machineCost).toBeCloseTo(333_333.33, 1); // 4000 giây = 1,1111 giờ x 300.000
  });

  it("vật tư theo diện tích (mực UV): 1000mm2 = 0,001 m2 x 100 cái x 2.000.000đ/m2 = 200.000", () => {
    const l = priceLine({ ...base, machine: { ...machine, consumableCostPerM2: 2_000_000 } });
    expect(l.cost.consumableCost).toBeCloseTo(200_000, 6);
    expect(l.cost.totalCost).toBeCloseTo(443_333.33 + 200_000, 1);
  });

  it("làm tròn tới bội số cấu hình và không bao giờ ra 0", () => {
    expect(roundPrice(5763.33, 100)).toBe(5800);
    expect(roundPrice(5749, 100)).toBe(5700);
    expect(roundPrice(12, 100)).toBe(100);
    expect(roundPrice(1234, 500)).toBe(1000);
  });

  it("tổng chiều dài cắt và diện tích khắc của lô", () => {
    expect(jobTotals(logo, 100, 40)).toEqual({ totalCutMm: 20_000, engraveAreaMm2: 40_000 });
  });
});

describe("bậc lãi", () => {
  it("chọn đúng bậc theo số lượng, ở các biên", () => {
    expect(markupFor(config.marginTiers, 1)).toBe(40);
    expect(markupFor(config.marginTiers, 99)).toBe(40);
    expect(markupFor(config.marginTiers, 100)).toBe(30);
    expect(markupFor(config.marginTiers, 499)).toBe(30);
    expect(markupFor(config.marginTiers, 500)).toBe(20);
    expect(markupFor(config.marginTiers, 100000)).toBe(20);
    expect(markupFor([{ fromQty: 50, toQty: null, markupPct: 10 }], 49)).toBeNull();
  });

  it("kiểm tra chồng và hở giữa các bậc", () => {
    expect(validateMarginTiers(config.marginTiers)).toBeNull();
    expect(validateMarginTiers([{ fromQty: 1, toQty: 100, markupPct: 10 }, { fromQty: 100, toQty: null, markupPct: 5 }])).toMatch(/chồng/);
    expect(validateMarginTiers([{ fromQty: 1, toQty: 49, markupPct: 10 }, { fromQty: 60, toQty: null, markupPct: 5 }])).toMatch(/khoảng hở/);
    expect(validateMarginTiers([{ fromQty: 1, toQty: null, markupPct: 10 }, { fromQty: 60, toQty: null, markupPct: 5 }])).toMatch(/bậc cuối/);
    expect(validateMarginTiers([{ fromQty: 1, toQty: null, markupPct: -1 }])).toMatch(/0 đến 1000/);
  });

  it("đọc cấu hình từ dữ liệu thô, bỏ phần hỏng và không tự bịa giá trị", () => {
    const parsed = parseMarginTiers([{ fromQty: 100, toQty: null, markupPct: 30 }, { fromQty: "x" }, null, { fromQty: 1, toQty: 99, markupPct: "40" }]);
    expect(parsed).toEqual([{ fromQty: 1, toQty: 99, markupPct: 40 }, { fromQty: 100, toQty: null, markupPct: 30 }]);
    const empty = parseQuoteConfig(null);
    expect(empty).toEqual({ defaultGapMm: null, lastSheetPolicy: null, marginTiers: [], quantities: [], roundTo: null, engravePct: {} });
    const c = parseQuoteConfig({ defaultGapMm: "3", lastSheetPolicy: "SAI", marginTiers: [], displayQuantities: [100, 50, 50, -1, 2.5], roundTo: 0, engraveLevels: { IT: 10, VUA: 120, NHIEU: "x" } });
    expect(c.defaultGapMm).toBe(3);
    expect(c.lastSheetPolicy).toBeNull();
    expect(c.quantities).toEqual([50, 100]);
    expect(c.roundTo).toBeNull();
    expect(c.engravePct).toEqual({ IT: 10 });
  });
});

describe("thiếu thông số thì KHÔNG ra giá", () => {
  const emptyMaterial: MaterialStock = { stockWidthMm: null, stockHeightMm: null, stockPrice: null, edgeMarginMm: null, gapMm: null, allowRotate: true, technique: null };
  const emptyConfig: QuoteConfig = { defaultGapMm: null, lastSheetPolicy: null, marginTiers: [], quantities: [], roundTo: null, engravePct: {} };

  it("dữ liệu trống hoàn toàn: báo thiếu đủ mọi nhóm và không có giá", () => {
    const r = computeQuote({ material: emptyMaterial, machine: null, config: emptyConfig, logo, engraveLevel: "VUA" });
    expect(r.ok).toBe(false);
    if (r.ok || r.reason !== "MISSING") throw new Error("phải báo thiếu");
    const codes = r.missing.map((m) => m.code);
    expect(codes).toEqual(expect.arrayContaining(["stockWidthMm", "stockHeightMm", "stockPrice", "edgeMarginMm", "gapMm", "technique", "lastSheetPolicy", "roundTo", "marginTiers", "quantities", "engrave:VUA"]));
    expect(new Set(r.missing.map((m) => m.scope))).toEqual(new Set(["material", "config"]));
    expect(r.missing.every((m) => m.label && m.hint)).toBe(true);
  });

  it.each([
    ["stockWidthMm", { stockWidthMm: null }],
    ["stockHeightMm", { stockHeightMm: null }],
    ["stockPrice", { stockPrice: null }],
    ["edgeMarginMm", { edgeMarginMm: null }],
  ])("thiếu %s thì không ra giá", (code, patch) => {
    const r = computeQuote(input({ material: { ...material, ...patch } }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason === "MISSING" && r.missing.map((m) => m.code)).toContain(code);
  });

  it("giá tấm bằng 0 coi là thiếu (không ra giá 0 đồng)", () => {
    expect(computeQuote(input({ material: { ...material, stockPrice: 0 } })).ok).toBe(false);
  });

  it("lề tấm 0 là giá trị hợp lệ, khác với trống", () => {
    expect(computeQuote(input({ material: { ...material, edgeMarginMm: 0 } })).ok).toBe(true);
  });

  it("gap lấy từ chất liệu, không có thì dùng mặc định chung, cả hai trống thì thiếu", () => {
    expect(computeQuote(input({ material: { ...material, gapMm: null } })).ok).toBe(true);
    const r = computeQuote(input({ material: { ...material, gapMm: null }, config: { ...config, defaultGapMm: null } }));
    expect(r.ok).toBe(false);
  });

  it("chưa có dòng thông số máy cho công nghệ thì thiếu, và nói rõ công nghệ nào", () => {
    const r = computeQuote(input({ machine: null }));
    expect(r.ok).toBe(false);
    if (r.ok || r.reason !== "MISSING") throw new Error();
    expect(r.missing[0].label).toContain("cat-laser");
  });

  it("thiếu từng thông số máy đều bị bắt", () => {
    for (const key of ["cutSpeedMmPerSec", "setupMinutesPerJob", "sheetChangeMinutes", "machineCostPerHour", "laborSecondsPerPiece", "laborCostPerHour"] as const) {
      const r = computeQuote(input({ machine: { ...machine, [key]: null } }));
      expect(r.ok, key).toBe(false);
    }
  });

  it("tốc độ khắc chỉ bắt buộc khi có khắc", () => {
    const noSpeed = { ...machine, engraveSpeedMm2PerSec: null };
    expect(computeQuote(input({ machine: noSpeed, engraveLevel: "KHONG_KHAC" })).ok).toBe(true);
    expect(computeQuote(input({ machine: noSpeed, engraveLevel: "IT" })).ok).toBe(false);
  });

  it("mức khắc chưa đặt % diện tích thì thiếu", () => {
    const r = computeQuote(input({ engraveLevel: "NHIEU", config: { ...config, engravePct: { IT: 10 } } }));
    expect(r.ok).toBe(false);
  });

  it("thiếu bậc lãi cho một mốc số lượng thì báo đúng mốc đó", () => {
    const r = computeQuote(input({ config: { ...config, marginTiers: [{ fromQty: 100, toQty: null, markupPct: 30 }] } }));
    expect(r.ok).toBe(false);
    if (r.ok || r.reason !== "MISSING") throw new Error();
    expect(r.missing.map((m) => m.code)).toContain("markup:50");
    expect(r.missing.map((m) => m.code)).not.toContain("markup:100");
  });

  it("findMissing rỗng khi đủ thông số", () => {
    expect(findMissing({ material, machine, config, engraveLevel: "VUA", quantities: [50, 100] })).toEqual([]);
  });
});

describe("tính báo giá đầy đủ", () => {
  it("logo 50x50 trên tấm 600x400 gap 15: 54 logo/tấm, bảng giá theo từng mốc", () => {
    const r = computeQuote(input());
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.perSheet).toBe(54);
    expect(r.lines.map((l) => l.quantity)).toEqual([50, 100, 200, 500, 1000]);
    expect(r.lines.map((l) => l.sheetsNeeded)).toEqual([1, 2, 4, 10, 19]);
    // mốc 100 trùng ví dụ kiểm tra tay
    expect(r.lines[1].unitPrice).toBe(5800);
    expect(r.lines[1].totalPrice).toBe(580_000);
    // đơn giá giảm dần khi số lượng tăng (setup chia nhỏ, lãi giảm bậc)
    const prices = r.lines.map((l) => l.unitPrice);
    expect([...prices].sort((a, b) => b - a)).toEqual(prices);
  });

  it("dùng mốc số lượng tùy chọn thay cho mặc định", () => {
    const r = computeQuote(input({ quantities: [30, 7] }));
    expect(r.ok && r.lines.map((l) => l.quantity)).toEqual([7, 30]);
  });

  it("logo lớn hơn tấm: báo lỗi của bộ xếp hình, không ra giá", () => {
    const r = computeQuote(input({ logo: { ...logo, widthMm: 700, heightMm: 500 } }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason === "NESTING" && r.error).toMatch(/lớn hơn vùng dùng được/);
  });

  it("không cho xoay thì không xoay: chất liệu có họa tiết hướng", () => {
    const r = computeQuote(input({ material: { ...material, allowRotate: false }, logo: { ...logo, widthMm: 100, heightMm: 30 }, config: { ...config, defaultGapMm: 5 }, }));
    expect(r.ok && r.nesting.placements.every((p) => p.rotation === 0)).toBe(true);
  });

  it("đổi giá tấm thì giá bán đổi theo (xưởng chỉnh được giá nhập)", () => {
    const a = computeQuote(input());
    const b = computeQuote(input({ material: { ...material, stockPrice: 240_000 } }));
    if (!a.ok || !b.ok) throw new Error();
    expect(b.lines[1].unitPrice).toBeGreaterThan(a.lines[1].unitPrice);
  });
});

describe("phân quyền: sale không bao giờ nhận giá vốn", () => {
  const FORBIDDEN_KEYS = ["cost", "materialCost", "machineCost", "laborCost", "consumableCost", "totalCost", "unitCost", "markupPct", "unitPriceRaw", "stockPrice", "machineCostPerHour", "laborCostPerHour", "laborSecondsPerPiece", "cutSpeedMmPerSec", "engraveSpeedMm2PerSec", "setupMinutesPerJob", "sheetChangeMinutes", "consumableCostPerM2", "marginTiers", "params", "config", "machine"];

  function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
    if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        out.add(k);
        keysDeep(x, out);
      }
    }
    return out;
  }

  it("góc nhìn của sale không chứa khóa nào về giá vốn, lãi, giá tấm hay thông số máy", () => {
    const r = computeQuote(input({ engraveLevel: "VUA" }));
    const sale = toSaleView(r);
    const keys = keysDeep(JSON.parse(JSON.stringify(sale)));
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k), `khóa bị cấm: ${k}`).toBe(false);
    // và không chứa giá trị của giá vốn dưới bất kỳ tên nào
    if (!r.ok) throw new Error();
    const text = JSON.stringify(sale);
    expect(text).not.toContain(String(r.lines[1].cost.totalCost));
    expect(text).not.toContain("120000");
  });

  it("sale vẫn thấy đủ thứ cần để báo giá", () => {
    const sale = toSaleView(computeQuote(input()));
    if (!sale.ok) throw new Error();
    expect(sale.perSheet).toBe(54);
    expect(sale.lines[0]).toEqual({ quantity: 50, sheetsNeeded: 1, machineMinutes: expect.any(Number), unitPrice: expect.any(Number), totalPrice: expect.any(Number) });
    expect(sale.layout.placements).toHaveLength(54);
    expect(sale.layout.stock.widthMm).toBe(600);
  });

  it("admin thấy chi tiết giá vốn và thông số đã dùng", () => {
    const admin = toAdminView(computeQuote(input()));
    if (!admin.ok) throw new Error();
    expect(admin.lines[1].cost.totalCost).toBeCloseTo(443_333.33, 1);
    expect(admin.params.material.stockPrice).toBe(120_000);
    expect(admin.params.machine.laborCostPerHour).toBe(60_000);
  });

  it("khi thiếu thông số, sale chỉ thấy danh sách thiếu và thông báo, không có số nào", () => {
    const sale = toSaleView(computeQuote(input({ material: { ...material, stockPrice: null } })));
    expect(sale.ok).toBe(false);
    if (sale.ok || sale.reason !== "MISSING") throw new Error();
    expect(sale.message).toBe("Thiếu thông số, chưa tính được giá");
    expect(sale.missing.map((m) => m.code)).toEqual(["stockPrice"]);
    expect(JSON.stringify(sale)).not.toMatch(/unitPrice|totalPrice/);
  });

  it("bảng giá gửi khách chỉ có số lượng, đơn giá và thành tiền", () => {
    const sale = toSaleView(computeQuote(input()));
    if (!sale.ok) throw new Error();
    const text = customerPriceText(sale.lines, { title: "Logo ABC" });
    expect(text).toContain("Logo ABC");
    expect(text).toContain("5.800");
    expect(text).not.toMatch(/phút|tấm|vốn|lãi/i);
  });
});

describe("gợi ý đổi kích thước", () => {
  it("giảm kích thước một chút làm tăng đáng kể số logo trên tấm thì gợi ý", () => {
    // 600x400, gap 15: 50mm => 54 (9x6). 46mm => 10x6=60... thử mức 4,8cm của ví dụ
    const base = { stockWidthMm: 600, stockHeightMm: 400, edgeMarginMm: 0, gapMm: 15, logoWidthMm: 50, logoHeightMm: 50, allowRotate: true };
    const s = suggestSizes(base);
    expect(s.length).toBeGreaterThan(0);
    for (const x of s) {
      expect(x.perSheet).toBeGreaterThan(54);
      expect(x.gainPct).toBeGreaterThanOrEqual(10);
      expect(Math.abs(x.changePct)).toBeLessThanOrEqual(10);
    }
    expect(s[0].widthMm).toBeLessThan(50);
    // sắp theo mức đổi nhỏ nhất trước
    for (let i = 1; i < s.length; i++) expect(Math.abs(s[i].changePct)).toBeGreaterThanOrEqual(Math.abs(s[i - 1].changePct));
  });

  it("không gợi ý khi đổi kích thước không có lợi đáng kể", () => {
    const base = { stockWidthMm: 600, stockHeightMm: 400, edgeMarginMm: 0, gapMm: 0, logoWidthMm: 100, logoHeightMm: 100, allowRotate: true }; // 6x4 = 24, khít
    expect(suggestSizes(base, { maxChangePct: 2 })).toEqual([]);
  });
});

describe("hiệu chỉnh từ thời gian thực tế", () => {
  // số liệu tổng hợp từ: setup 12 phút, đổi tấm 3 phút, cắt 25 mm/s, khắc 8 mm2/s
  const truth = { setup: 12, change: 3, cut: 25, engrave: 8 };
  const sample = (cutMm: number, engArea: number, sheets: number, noise = 0) => ({
    totalCutMm: cutMm,
    engraveAreaMm2: engArea,
    sheets,
    actualMinutes: truth.setup + truth.change * sheets + cutMm / truth.cut / 60 + engArea / truth.engrave / 60 + noise,
  });
  const good = [
    sample(10_000, 0, 1), sample(30_000, 5_000, 2), sample(55_000, 0, 3), sample(20_000, 40_000, 2),
    sample(80_000, 15_000, 5), sample(45_000, 60_000, 4), sample(15_000, 25_000, 1), sample(70_000, 10_000, 6),
    sample(25_000, 80_000, 3), sample(95_000, 30_000, 7),
  ];

  it("tìm lại đúng các thông số khi số liệu không nhiễu", () => {
    const r = calibrate(good);
    expect(r.n).toBe(10);
    expect(r.r2).toBeCloseTo(1, 6);
    expect(r.suggested.setupMinutesPerJob).toBeCloseTo(12, 4);
    expect(r.suggested.sheetChangeMinutes).toBeCloseTo(3, 4);
    expect(r.suggested.cutSpeedMmPerSec).toBeCloseTo(25, 3);
    expect(r.suggested.engraveSpeedMm2PerSec).toBeCloseTo(8, 3);
    expect(r.warnings).toEqual([]);
  });

  it("chịu được nhiễu nhỏ", () => {
    const noisy = good.map((s, i) => ({ ...s, actualMinutes: s.actualMinutes + (i % 2 ? 0.4 : -0.4) }));
    const r = calibrate(noisy);
    expect(r.r2).toBeGreaterThan(0.99);
    expect(r.suggested.cutSpeedMmPerSec).toBeGreaterThan(20);
    expect(r.suggested.cutSpeedMmPerSec).toBeLessThan(30);
  });

  it(`dưới ${MIN_SAMPLES} đơn thì không đề xuất`, () => {
    const r = calibrate(good.slice(0, MIN_SAMPLES - 1));
    expect(r.suggested.cutSpeedMmPerSec).toBeNull();
    expect(r.warnings[0]).toMatch(/cần ít nhất/);
  });

  it("chưa có đơn nào khắc thì không ước lượng tốc độ khắc, nhưng vẫn ước lượng phần còn lại", () => {
    const noEngrave = good.map((s) => sample(s.totalCutMm, 0, s.sheets));
    const r = calibrate(noEngrave);
    expect(r.suggested.engraveSpeedMm2PerSec).toBeNull();
    expect(r.suggested.cutSpeedMmPerSec).toBeCloseTo(25, 3);
    expect(r.warnings.join(" ")).toMatch(/Chưa có đơn nào có khắc/);
  });

  it("số liệu phụ thuộc lẫn nhau thì báo chưa tách được, không đoán", () => {
    // số tấm luôn tỉ lệ đúng với chiều dài cắt
    const collinear = Array.from({ length: 10 }, (_, i) => ({ totalCutMm: (i + 1) * 10_000, engraveAreaMm2: 0, sheets: i + 1, actualMinutes: 10 + (i + 1) * 5 }));
    const r = calibrate(collinear);
    expect(r.suggested.cutSpeedMmPerSec).toBeNull();
    expect(r.warnings.join(" ")).toMatch(/phụ thuộc lẫn nhau/);
  });
});
