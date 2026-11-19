import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOG_PROMPT, DEFAULT_DESIGN_PROMPT } from "./defaults";
import { buildMaterialsList, renderPrompt, validateTemplate } from "./render";

describe("prompt mặc định", () => {
  it("hợp lệ (không biến lạ, catalog có materials_list)", () => {
    expect(validateTemplate("CATALOG", DEFAULT_CATALOG_PROMPT)).toBeNull();
    expect(validateTemplate("DESIGN", DEFAULT_DESIGN_PROMPT)).toBeNull();
  });

  it("nêu rõ logo là vật thể cắt theo hình logo, mặt trước bên trái, viền là mặt sau bên phải", () => {
    for (const p of [DEFAULT_CATALOG_PROMPT, DEFAULT_DESIGN_PROMPT]) {
      expect(p).toMatch(/die-cut/);
      expect(p).toMatch(/LEFT panel = FRONT material/);
      expect(p).toMatch(/RIGHT panel = BACK material/);
      expect(p).toMatch(/Never copy the shape, holes/);
    }
    expect(DEFAULT_CATALOG_PROMPT).toMatch(/NOT a logo printed or engraved on a rectangular tag/);
  });

  it("sinh được prompt catalog đầy đủ cho trang 2x4 với 8 chất liệu", () => {
    const mats = Array.from({ length: 8 }, (_, i) => ({ printTech: `UV ${i}` }));
    const out = renderPrompt(DEFAULT_CATALOG_PROMPT, {
      cols: 2,
      rows: 4,
      materials_list: buildMaterialsList(mats, { cols: 2, rows: 4 }),
    });
    expect(out).toContain("grid of 2 columns and 4 rows");
    expect(out).toContain("Cell 1 = reference image 2: use the front and back materials shown in the two panels of the reference image, technique: UV 0");
    expect(out).toContain("Cell 8 = reference image 9:");
    expect(out).not.toContain("{{");
  });

  it("sinh được prompt thiết kế", () => {
    const out = renderPrompt(DEFAULT_DESIGN_PROMPT, { product_type: "móc khóa", design_style: "tối giản", note: "" });
    expect(out).toContain("móc khóa");
    expect(out).not.toContain("{{");
  });
});
