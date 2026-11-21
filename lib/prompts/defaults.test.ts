import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOG_PROMPT, DEFAULT_DESIGN_PROMPT } from "./defaults";
import { FINISH_RULES } from "./finish";
import { buildMaterialsList, renderDesignPrompt, renderPrompt, validateTemplate } from "./render";

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
    expect(out).toContain("Cell 1 = reference image 2: use the front and back materials shown in the two panels of the reference image, technique: UV 0. Finish: ");
    expect(out).toContain("Cell 8 = reference image 9:");
    expect(out).not.toContain("{{");
  });

  it("sinh được prompt thiết kế, có câu dặn kiểu hoàn thiện đúng chỗ", () => {
    const out = renderDesignPrompt(DEFAULT_DESIGN_PROMPT, { product_type: "móc khóa", design_style: "tối giản", note: "" }, FINISH_RULES.CUT);
    expect(out).toContain("móc khóa");
    expect(out).toContain(`Finish of the logo piece (follow it exactly; it decides how the piece is made and looks and overrides any general rule above that conflicts with it): ${FINISH_RULES.CUT}`);
    expect(out).not.toContain("{{");
    // biến đã có sẵn trong mẫu: không bị nối thêm lần nữa
    expect(out.split(FINISH_RULES.CUT)).toHaveLength(2);
  });

  it("prompt mặc định chừa ngoại lệ hàng chỉ cắt (không viền) và không còn ghi cứng 'laser-engraved' cho mọi hàng", () => {
    for (const p of [DEFAULT_CATALOG_PROMPT, DEFAULT_DESIGN_PROMPT]) {
      expect(p).toMatch(/cut-only/);
      expect(p).toMatch(/finish rule/);
      expect(p).not.toMatch(/printed \/ laser-engraved cut-out/);
    }
    expect(DEFAULT_CATALOG_PROMPT).toMatch(/except in cut-only cells/);
    expect(DEFAULT_DESIGN_PROMPT).toMatch(/unless the finish rule says/);
  });
});
