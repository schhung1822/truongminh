import { describe, expect, it } from "vitest";
import { FINISH_RULES, finishKindOf, finishRuleOf } from "./finish";

describe("finishKindOf", () => {
  it("ba công nghệ mặc định theo mã", () => {
    expect(finishKindOf({ technique: "khac-laser", printTech: "Khắc laser" })).toBe("ENGRAVE");
    expect(finishKindOf({ technique: "cat-laser", printTech: "Cắt laser" })).toBe("CUT");
    expect(finishKindOf({ technique: "in-uv", printTech: "In UV" })).toBe("PRINT");
  });

  it("mã công nghệ thắng nhãn (nhãn có thể bị đổi tên)", () => {
    expect(finishKindOf({ technique: "cat-laser", printTech: "Khắc laser" })).toBe("CUT");
  });

  it("không có mã thì đoán theo nhãn, có dấu hoặc không dấu", () => {
    expect(finishKindOf({ printTech: "Cắt laser" })).toBe("CUT");
    expect(finishKindOf({ printTech: "CAT LASER" })).toBe("CUT");
    expect(finishKindOf({ printTech: "Khắc laser" })).toBe("ENGRAVE");
    expect(finishKindOf({ printTech: "laser engraving" })).toBe("ENGRAVE");
    expect(finishKindOf({ printTech: "In UV" })).toBe("PRINT");
    expect(finishKindOf({ printTech: "UV print" })).toBe("PRINT");
    expect(finishKindOf({ printTech: "laser cut" })).toBe("CUT");
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

describe("FINISH_RULES", () => {
  it("hàng cắt: một lớp, không viền, không khắc, không dùng mặt sau", () => {
    const r = FINISH_RULES.CUT;
    expect(r).toMatch(/ONE single thin flat layer/);
    expect(r).toMatch(/NO border or rim/);
    expect(r).toMatch(/NO engraving/);
    expect(r).toMatch(/Do not use the RIGHT \(back\) panel/);
  });

  it("hàng in UV: in phẳng, không khắc", () => {
    expect(FINISH_RULES.PRINT).toMatch(/printed flat/);
    expect(FINISH_RULES.PRINT).toMatch(/no engraving/);
  });

  it("hàng khắc vẫn có mặt trước + viền mảnh như hai nửa ảnh mẫu", () => {
    expect(FINISH_RULES.ENGRAVE).toMatch(/laser-engraved/);
    expect(FINISH_RULES.ENGRAVE).toMatch(/back-material border/);
  });

  it("finishRuleOf lấy đúng câu theo chất liệu", () => {
    expect(finishRuleOf({ technique: "cat-laser" })).toBe(FINISH_RULES.CUT);
    expect(finishRuleOf({ technique: "in-uv" })).toBe(FINISH_RULES.PRINT);
    expect(finishRuleOf({ technique: "khac-laser" })).toBe(FINISH_RULES.ENGRAVE);
  });
});
