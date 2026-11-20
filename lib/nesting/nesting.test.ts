import { describe, expect, it } from "vitest";
import { fitCount, hybridGrid, straightGrid } from "./grid";
import { nest, verifyPlacements } from "./nest";
import type { LogoContour, NestingInput, NestingStrategy } from "./types";

const base = (over: Partial<NestingInput> = {}): NestingInput => ({
  stockWidthMm: 600,
  stockHeightMm: 400,
  edgeMarginMm: 0,
  gapMm: 15,
  logoWidthMm: 50,
  logoHeightMm: 50,
  allowRotate: true,
  ...over,
});

/** Đa giác đều n cạnh nội tiếp hình tròn bán kính r, đặt trong khung [0,2r]x[0,2r]. */
function disc(r: number, n = 72): LogoContour {
  return { outers: [Array.from({ length: n }, (_, i) => ({ x: r + r * Math.cos((2 * Math.PI * i) / n), y: r + r * Math.sin((2 * Math.PI * i) / n) }))], toleranceMm: 0.05 };
}

describe("fitCount", () => {
  it("n phần tử cần n*size + (n-1)*gap", () => {
    expect(fitCount(600, 50, 15)).toBe(9); // 9*50 + 8*15 = 570; 10 phần tử cần 635
    expect(fitCount(400, 50, 15)).toBe(6); // 6*50 + 5*15 = 375
    expect(fitCount(40, 50, 0)).toBe(0);
    expect(fitCount(50, 50, 15)).toBe(1); // vừa khít
  });

  it("không bị sai số số thực làm mất một phần tử khi vừa khít", () => {
    expect(fitCount(0.3, 0.1, 0.05)).toBe(2); // 2*0.1 + 0.05 = 0.25 <= 0.3
    expect(fitCount(0.1 * 3 + 0.2 * 2, 0.1, 0.2)).toBe(3);
  });
});

describe("bài kiểm tra bắt buộc", () => {
  it("logo 50x50mm, tấm 600x400mm, lề 0, gap 15mm => 54", () => {
    const r = nest(base());
    expect(r.error).toBeUndefined();
    expect(r.count).toBe(54);
    expect(r.placements).toHaveLength(54);
    expect(r.strategy).toBe("grid-0"); // bằng nhau thì chọn lưới thẳng, không xoay
  });

  it("gap 1.5mm => 77", () => {
    expect(nest(base({ gapMm: 1.5 })).count).toBe(77);
  });

  it("logo dài 100x30mm: xếp lai >= max(chỉ 0°, chỉ 90°), và kết quả chung >= xếp lai", () => {
    for (const gap of [0, 1.5, 5, 15]) {
      for (const stock of [
        [600, 400],
        [610, 405],
        [1200, 600],
        [333, 777],
      ]) {
        const input = base({ logoWidthMm: 100, logoHeightMm: 30, gapMm: gap, stockWidthMm: stock[0], stockHeightMm: stock[1] });
        const g0 = straightGrid(0).run(input)?.placements.length ?? 0;
        const g90 = straightGrid(90).run(input)?.placements.length ?? 0;
        const hy = hybridGrid.run(input)?.placements.length ?? 0;
        expect(hy).toBeGreaterThanOrEqual(Math.max(g0, g90));
        expect(nest(input).count).toBeGreaterThanOrEqual(hy);
      }
    }
  });

  it("logo dài: xếp lai thực sự hơn lưới thẳng ở ít nhất một khổ tấm", () => {
    // 600x400, gap 5: 0° được 5x11=55, 90° được 17x3=51; chia vùng tốt hơn
    const input = base({ logoWidthMm: 100, logoHeightMm: 30, gapMm: 5 });
    const g0 = straightGrid(0).run(input)!.placements.length;
    const g90 = straightGrid(90).run(input)!.placements.length;
    const hy = hybridGrid.run(input)!.placements.length;
    expect(g0).toBe(55);
    expect(g90).toBe(51);
    expect(hy).toBeGreaterThan(Math.max(g0, g90));
    expect(nest(input).strategy).toBe("hybrid");
  });

  it("logo lớn hơn tấm => 0 logo và báo lỗi rõ ràng", () => {
    const r = nest(base({ logoWidthMm: 700, logoHeightMm: 500 }));
    expect(r.count).toBe(0);
    expect(r.placements).toEqual([]);
    expect(r.error).toMatch(/lớn hơn vùng dùng được/);
    expect(r.error).toMatch(/700 x 500/);
  });

  it("logo chỉ vừa khi xoay thì vẫn xếp được; không cho xoay thì báo lỗi", () => {
    const input = base({ logoWidthMm: 450, logoHeightMm: 100 }); // 450 > 400 cao tấm nhưng vừa khi xoay? 450x100: vừa 0° (450<=600, 100<=400)
    expect(nest(input).count).toBeGreaterThan(0);
    const tall = base({ logoWidthMm: 100, logoHeightMm: 500, stockWidthMm: 600, stockHeightMm: 400 }); // cao 500 > 400, xoay thành 500x100 thì vừa
    expect(nest(tall).count).toBeGreaterThan(0);
    expect(nest(tall).placements.every((p) => p.rotation === 90)).toBe(true);
    const locked = nest({ ...tall, allowRotate: false });
    expect(locked.count).toBe(0);
    expect(locked.error).toBeTruthy();
    expect(locked.error).not.toMatch(/kể cả khi xoay/);
  });

  it("allowRotate = false thì không có logo nào xoay, kể cả khi xoay sẽ xếp được nhiều hơn", () => {
    const input = base({ logoWidthMm: 100, logoHeightMm: 30, gapMm: 5, allowRotate: false });
    const r = nest(input);
    expect(r.count).toBe(55);
    expect(r.placements.every((p) => p.rotation === 0)).toBe(true);
    expect(r.candidates.map((c) => c.strategy)).toEqual(["grid-0"]);
    // cho xoay thì nhiều hơn, chứng tỏ ràng buộc có tác dụng
    expect(nest({ ...input, allowRotate: true }).count).toBeGreaterThan(55);
  });
});

describe("lề tấm và kiểm tra hợp lệ", () => {
  it("lề thu nhỏ vùng dùng được", () => {
    const r = nest(base({ edgeMarginMm: 10, gapMm: 0, logoWidthMm: 100, logoHeightMm: 100 }));
    // vùng dùng 580x380 => 5 x 3
    expect(r.count).toBe(15);
    expect(Math.min(...r.placements.map((p) => p.x))).toBe(10);
    expect(Math.min(...r.placements.map((p) => p.y))).toBe(10);
    expect(verifyPlacements(base({ edgeMarginMm: 10, gapMm: 0, logoWidthMm: 100, logoHeightMm: 100 }), r.placements)).toBeNull();
  });

  it("lề quá lớn thì báo lỗi", () => {
    const r = nest(base({ edgeMarginMm: 250 }));
    expect(r.count).toBe(0);
    expect(r.error).toMatch(/Lề tấm quá lớn/);
  });

  it("đầu vào sai thì báo lỗi, không ném lỗi", () => {
    expect(nest(base({ logoWidthMm: 0 })).error).toMatch(/chiều rộng logo/);
    expect(nest(base({ stockHeightMm: Number.NaN })).error).toMatch(/chiều cao tấm/);
    expect(nest(base({ gapMm: -1 })).error).toMatch(/Khoảng cách/);
    expect(nest(base({ edgeMarginMm: -1 })).error).toMatch(/Lề/);
  });

  it("bố cục của mọi phương án lưới đều hợp lệ (trong vùng, không chồng, đủ khoảng cách)", () => {
    for (const gap of [0, 3, 10]) {
      for (const [w, h] of [
        [50, 50],
        [100, 30],
        [37, 81],
      ]) {
        const input = base({ logoWidthMm: w, logoHeightMm: h, gapMm: gap, edgeMarginMm: 7, stockWidthMm: 420, stockHeightMm: 300 });
        for (const s of [straightGrid(0), straightGrid(90), hybridGrid]) {
          const run = s.run(input);
          if (run) expect(verifyPlacements(input, run.placements), `${s.id} ${w}x${h} gap ${gap}`).toBeNull();
        }
      }
    }
  });

  it("hiệu suất = diện tích logo / diện tích tấm", () => {
    const r = nest(base());
    expect(r.efficiencyPct).toBeCloseTo((54 * 50 * 50 * 100) / (600 * 400), 9);
    const withArea = nest(base({ logoAreaMm2: 2000 }));
    expect(withArea.efficiencyPct).toBeCloseTo((54 * 2000 * 100) / (600 * 400), 9);
  });

  it("liệt kê các phương án đã chạy để so sánh", () => {
    const r = nest(base({ logoWidthMm: 100, logoHeightMm: 30, gapMm: 5 }));
    expect(r.candidates.map((c) => c.strategy)).toEqual(expect.arrayContaining(["grid-0", "grid-90", "hybrid"]));
    expect(r.candidates[0].count).toBe(r.count);
  });
});

describe("lưới so le (cấp 2)", () => {
  it("không có đường viền thì bỏ qua xếp so le", () => {
    const r = nest(base({ gapMm: 5 }));
    expect(r.candidates.some((c) => c.strategy.startsWith("stagger"))).toBe(false);
  });

  it("logo tròn: xếp so le nhiều hơn lưới thẳng và hợp lệ", () => {
    // đường kính 50, gap 5, tấm 600x400: lưới thẳng 11 x 7 = 77; so le kiểu tổ ong 8 hàng (11 + 10 luân phiên) = 84
    const input = base({ gapMm: 5, logoWidthMm: 50, logoHeightMm: 50, contour: disc(25), logoAreaMm2: Math.PI * 25 * 25 });
    const r = nest(input);
    expect(r.candidates.find((c) => c.strategy === "grid-0")!.count).toBe(77);
    expect(r.strategy).toBe("stagger-0");
    expect(r.count).toBeGreaterThanOrEqual(82);
    expect(r.count).toBeLessThanOrEqual(84);
    expect(verifyPlacements(input, r.placements)).toBeNull();
  });

  it("khoảng cách hàng nhỏ hơn cạnh logo nhưng không nhỏ hơn mức hình học cho phép", () => {
    const input = base({ gapMm: 5, contour: disc(25) });
    const run = nest(input).placements;
    const ys = [...new Set(run.map((p) => Math.round(p.y * 1000) / 1000))].sort((a, b) => a - b);
    const pitch = ys[1] - ys[0];
    expect(pitch).toBeLessThan(55); // chặt hơn lưới thẳng
    expect(pitch).toBeGreaterThanOrEqual(Math.sqrt(55 ** 2 - 27.5 ** 2) - 0.5); // đường kính 50 + gap 5 => tâm cách 55, hàng lệch nửa ô
  });

  it("logo vuông có đường viền khớp khung bao: so le không hơn lưới thẳng, nên chọn lưới thẳng", () => {
    const square: LogoContour = {
      outers: [[{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }]],
      toleranceMm: 0.05,
    };
    const r = nest(base({ gapMm: 5, contour: square }));
    expect(r.strategy).toBe("grid-0");
  });

  it("so le xoay 90° cần cho phép xoay", () => {
    const input = base({ gapMm: 5, logoWidthMm: 50, logoHeightMm: 50, contour: disc(25), allowRotate: false });
    expect(nest(input).candidates.some((c) => c.strategy === "stagger-90")).toBe(false);
    expect(nest({ ...input, allowRotate: true }).candidates.some((c) => c.strategy === "stagger-90")).toBe(true);
  });

  it("chạy đủ nhanh với logo nhỏ trên tấm lớn", () => {
    const t = Date.now();
    const r = nest(base({ stockWidthMm: 1000, stockHeightMm: 700, gapMm: 2, logoWidthMm: 30, logoHeightMm: 30, contour: disc(15) }));
    expect(r.count).toBeGreaterThan(500);
    expect(Date.now() - t).toBeLessThan(5000);
  });

  it("phương án so le sai bị loại thay vì được chọn", () => {
    // một phương án giả trả về nhiều logo chồng nhau, được đặt nhãn so le để đi qua bước kiểm tra
    const fake: NestingStrategy = {
      id: "stagger-fake",
      complexity: 99,
      run: () => ({
        label: "giả",
        // 100 logo chồng lên nhau để phương án này đứng đầu về số lượng và buộc phải qua bước kiểm tra
        placements: Array.from({ length: 100 }, (_, k) => ({ x: k, y: k % 7, width: 50, height: 50, rotation: 0 as const })),
      }),
    };
    const input = base({ contour: disc(25) });
    const r = nest(input, [fake, straightGrid(0)]);
    expect(r.strategy).toBe("grid-0");
    expect(r.warnings.join(" ")).toMatch(/Đã bỏ phương án/);
  });
});

describe("cổng cắm thuật toán mới (cấp 3)", () => {
  it("thêm một NestingStrategy bất kỳ mà không phải sửa chỗ khác; nhiều logo hơn thì thắng", () => {
    const rich: NestingStrategy = {
      id: "demo-rich",
      complexity: 9,
      run: (i) => ({ label: "demo", placements: [{ x: i.edgeMarginMm, y: i.edgeMarginMm, width: i.logoWidthMm, height: i.logoHeightMm, rotation: 0 }] }),
    };
    expect(nest(base(), [straightGrid(0), rich]).strategy).toBe("grid-0");
    const huge: NestingStrategy = {
      id: "demo-huge",
      complexity: 9,
      run: () => ({ label: "demo", placements: Array.from({ length: 100 }, (_, k) => ({ x: k, y: 0, width: 1, height: 1, rotation: 0 as const })) }),
    };
    expect(nest(base(), [straightGrid(0), huge]).strategy).toBe("demo-huge");
  });
});
