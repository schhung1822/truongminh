import { describe, expect, it } from "vitest";
import { FINISH_LABEL, finishKindOf, finishRule, finishRuleOf } from "./finish";

describe("finishKindOf", () => {
  it("hai công nghệ mặc định theo mã", () => {
    expect(finishKindOf({ technique: "khac-laser", printTech: "Khắc laser" })).toBe("ENGRAVE");
    expect(finishKindOf({ technique: "cat-laser", printTech: "Cắt laser" })).toBe("CUT");
  });

  it("mã công nghệ thắng nhãn (nhãn có thể bị đổi tên)", () => {
    expect(finishKindOf({ technique: "cat-laser", printTech: "Khắc laser" })).toBe("CUT");
  });

  it("không có mã thì đoán theo nhãn, có dấu hoặc không dấu", () => {
    expect(finishKindOf({ printTech: "Cắt laser" })).toBe("CUT");
    expect(finishKindOf({ printTech: "CAT LASER" })).toBe("CUT");
    expect(finishKindOf({ printTech: "Khắc laser" })).toBe("ENGRAVE");
    expect(finishKindOf({ printTech: "laser engraving" })).toBe("ENGRAVE");
    expect(finishKindOf({ printTech: "laser cut" })).toBe("CUT");
  });

  it("nhãn 'in UV' không còn là kiểu riêng (D101): rơi về mặc định khắc", () => {
    expect(finishKindOf({ technique: "in-uv", printTech: "In UV" })).toBe("ENGRAVE");
    expect(finishKindOf({ printTech: "UV print" })).toBe("ENGRAVE");
  });

  it("nhãn nhắc cả khắc lẫn cắt thì lấy khắc", () => {
    expect(finishKindOf({ printTech: "Cắt và khắc laser" })).toBe("ENGRAVE");
  });

  it("nhãn tự thêm không nhận ra được hoặc để trống: coi là khắc như trước nay", () => {
    expect(finishKindOf({ technique: "tu-them", printTech: "Chưa rõ" })).toBe("ENGRAVE");
    expect(finishKindOf({})).toBe("ENGRAVE");
    expect(finishKindOf({ technique: null, printTech: null })).toBe("ENGRAVE");
  });

  it("không nhận nhầm chữ chứa 'cat' hoặc 'in' trong từ khác", () => {
    expect(finishKindOf({ printTech: "Catalog" })).toBe("ENGRAVE");
    expect(finishKindOf({ printTech: "Inox" })).toBe("ENGRAVE");
  });
});

describe("finishRule", () => {
  it("nhãn kiểu hàng ghi trên từng ô", () => {
    expect(FINISH_LABEL).toEqual({ ENGRAVE: "ENGRAVED", CUT: "CUT-ONLY" });
  });

  it("hàng cắt: một lớp mặt trước, không viền, không khắc, không dùng mặt sau", () => {
    const r = finishRule("CUT");
    expect(r).toMatch(/single-layer cut decal/);
    expect(r).toMatch(/ONE thin flat layer of the FRONT material \(LEFT panel only\)/);
    expect(r).toMatch(/No border or rim of a second material, no engraving/);
    expect(r).toMatch(/The RIGHT \(back\) panel is not used/);
  });

  it("hàng khắc, logo thường: ôm sát hình logo, mặt trước lớp 1, viền mảnh lớp 2", () => {
    const r = finishRule("ENGRAVE");
    expect(r).toMatch(/two-layer laser-engraved piece, die-cut to the logo's own silhouette/);
    expect(r).toMatch(/front face is the FRONT material \(LEFT panel\)/);
    expect(r).toMatch(/thin, even border of the BACK material \(RIGHT panel\)/);
    expect(r).not.toMatch(/badge/);
  });

  it("hàng khắc, logo dạng huy hiệu (D113): giữ hình bảng; khung viền + chữ + biểu tượng là lớp trên, nền khắc chìm lộ lớp dưới", () => {
    const r = finishRule("ENGRAVE", true);
    expect(r).toMatch(/keeps the logo's badge shape: ONE solid plate with the badge's outer shape/);
    expect(r).toMatch(/never the bare letters alone/);
    expect(r).toMatch(/border line, symbol, wordmark and tagline are the untouched FRONT material \(LEFT panel\)/);
    expect(r).toMatch(/background \(.*\) is engraved down into the plate, a hair below the top, and shows the BACK material \(RIGHT panel\)/);
  });

  it("hàng khắc (D114): giữ đúng cách tả vẻ khắc laser của phiên 13:27, nét mảnh sắc phẳng, khắc chìm chứ không nổi khối", () => {
    for (const r of [finishRule("ENGRAVE"), finishRule("ENGRAVE", true)]) {
      expect(r).toMatch(/fine, crisp, perfectly flat laser-engraved look of the sample/);
      expect(r).toMatch(/engraved INTO the surface, with no bevel, no 3D relief, no shiny chrome emboss and no separate emblem glued on top/);
    }
    expect(finishRule("CUT")).not.toMatch(/laser-engraved look/);
  });

  it("hàng cắt với logo dạng huy hiệu: vẫn chỉ cắt biểu tượng + chữ, bỏ nền và khung của huy hiệu", () => {
    const r = finishRule("CUT", true);
    expect(r.startsWith(finishRule("CUT"))).toBe(true);
    expect(r).toMatch(/the badge's background plate and border line are dropped/);
  });

  it("không câu nào bảo AI tự đoán logo có phải huy hiệu hay không, và không nhắc tới màu của logo", () => {
    for (const r of [finishRule("ENGRAVE"), finishRule("ENGRAVE", true), finishRule("CUT"), finishRule("CUT", true)]) {
      expect(r).not.toMatch(/\bif the logo\b/i);
      expect(r).not.toMatch(/colour.* in the logo reference/);
    }
  });

  it("finishRuleOf lấy đúng câu theo công nghệ của chất liệu và ô huy hiệu của logo", () => {
    expect(finishRuleOf({ technique: "cat-laser" })).toBe(finishRule("CUT"));
    expect(finishRuleOf({ technique: "khac-laser" })).toBe(finishRule("ENGRAVE"));
    expect(finishRuleOf({ technique: "khac-laser" }, true)).toBe(finishRule("ENGRAVE", true));
    expect(finishRuleOf({ technique: "in-uv" })).toBe(finishRule("ENGRAVE"));
  });
});
