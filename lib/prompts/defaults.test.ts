import { describe, expect, it } from "vitest";
import { SELECTABLE_KIE_MODELS } from "@/lib/providers/kie-models";
import { DEFAULT_CATALOG_PROMPT, DEFAULT_DESIGN_PROMPT } from "./defaults";
import { finishRule } from "./finish";
import { buildMaterialsList, renderDesignPrompt, renderPrompt, validateTemplate } from "./render";

const ENGRAVE = { printTech: "Khắc laser", technique: "khac-laser" };
const CUT = { printTech: "Cắt laser", technique: "cat-laser" };

function catalog(mats: { printTech: string; technique: string }[], grid: { cols: number; rows: number }, badge = false) {
  return renderPrompt(DEFAULT_CATALOG_PROMPT, { ...grid, materials_list: buildMaterialsList(mats, grid, { badge }) });
}

describe("prompt mặc định", () => {
  it("hợp lệ (không biến lạ, catalog có materials_list)", () => {
    expect(validateTemplate("CATALOG", DEFAULT_CATALOG_PROMPT)).toBeNull();
    expect(validateTemplate("DESIGN", DEFAULT_DESIGN_PROMPT)).toBeNull();
  });

  it("khung chung: logo chỉ lấy hình, chất liệu lấy vân/màu từ hai nửa ảnh mẫu và phải giữ đúng", () => {
    for (const p of [DEFAULT_CATALOG_PROMPT, DEFAULT_DESIGN_PROMPT]) {
      expect(p).toMatch(/Reference image 1 is the customer's logo/);
      expect(p).toMatch(/Use only its shapes/);
      expect(p).toMatch(/Never copy its colours, its plain background or the surface it lies on/);
      expect(p).toMatch(/LEFT panel = FRONT material, RIGHT panel = BACK material/);
      expect(p).toMatch(/reproduce them faithfully/);
      expect(p).toMatch(/Never copy the shape, holes/);
      expect(p).toMatch(/THIN and FLAT/);
    }
    expect(DEFAULT_CATALOG_PROMPT).toMatch(/Never show the logo printed on a tag, card or keychain/);
  });

  it("khung chung trung tính về kiểu hàng (D113): không tự nói khắc hay cắt, không bảo AI tự đoán logo là huy hiệu", () => {
    for (const p of [DEFAULT_CATALOG_PROMPT, DEFAULT_DESIGN_PROMPT]) {
      expect(p).not.toMatch(/Decide what counts as/);
      expect(p).not.toMatch(/badge/i);
      expect(p).not.toMatch(/border and the edge of the logo piece are made of/);
    }
  });

  it("sinh được prompt catalog đầy đủ cho trang 2x4: 5 ô khắc rồi 3 ô cắt, kiểu ghi theo từng ô", () => {
    const out = catalog([ENGRAVE, ENGRAVE, ENGRAVE, ENGRAVE, ENGRAVE, CUT, CUT, CUT], { cols: 2, rows: 4 });
    expect(out).toContain("grid of 2 columns and 4 rows");
    expect(out).toContain(`- ENGRAVED = ${finishRule("ENGRAVE")}`);
    expect(out).toContain(`- CUT-ONLY = ${finishRule("CUT")}`);
    expect(out).toContain("Cell 1 (row 1, column 1) = reference image 2, type ENGRAVED (technique: Khắc laser)");
    expect(out).toContain("Cell 5 (row 3, column 1) = reference image 6, type ENGRAVED (technique: Khắc laser)");
    expect(out).toContain("Cell 6 (row 3, column 2) = reference image 7, type CUT-ONLY (technique: Cắt laser)");
    expect(out).toContain("Cell 8 (row 4, column 2) = reference image 9, type CUT-ONLY (technique: Cắt laser)");
    expect(out).not.toContain("{{");
  });

  it("cấm tráo, trộn chất liệu giữa các ô (D105, D112)", () => {
    expect(DEFAULT_CATALOG_PROMPT).toMatch(/come ONLY from its own line above/);
    expect(DEFAULT_CATALOG_PROMPT).toMatch(/Never swap or blend cells/);
    expect(DEFAULT_CATALOG_PROMPT).toMatch(/next to each other in the grid or in reading order/);
    expect(DEFAULT_CATALOG_PROMPT).toMatch(/materials that look alike \(e\.g\. two shiny, mirror-like or glittery ones\)/);
  });

  it("prompt catalog 10 ô (trường hợp dài nhất: đủ hai kiểu, logo huy hiệu) nằm trong giới hạn của mọi model đang cho chọn và không phình theo số ô", () => {
    const mats = Array.from({ length: 10 }, (_, i) => (i % 2 ? CUT : ENGRAVE));
    const minLimit = Math.min(...SELECTABLE_KIE_MODELS.map((m) => m.maxPromptChars));
    for (const badge of [false, true]) {
      const mixed = catalog(mats, { cols: 2, rows: 5 }, badge).length;
      const allEngrave = catalog(Array.from({ length: 10 }, () => ENGRAVE), { cols: 5, rows: 2 }, badge).length;
      expect(mixed).toBeLessThan(minLimit);
      expect(allEngrave).toBeLessThan(minLimit);
      // mỗi kiểu hàng chỉ định nghĩa một lần: 10 ô khắc không được dài hơn bản trộn hai kiểu, và cả hai dưới 7.000 ký tự
      expect(allEngrave).toBeLessThan(mixed);
      expect(mixed).toBeLessThan(7000);
    }
  });

  it("sinh được prompt thiết kế, có câu dặn kiểu hàng đúng chỗ và trong giới hạn 5.000 ký tự", () => {
    for (const rule of [finishRule("CUT"), finishRule("ENGRAVE"), finishRule("ENGRAVE", true), finishRule("CUT", true)]) {
      const out = renderDesignPrompt(DEFAULT_DESIGN_PROMPT, { product_type: "móc khóa", design_style: "tối giản", note: "" }, rule);
      expect(out).toContain("móc khóa");
      expect(out).toContain(`How the logo piece is made (fixed by our workshop from the material's production technique, follow it exactly): ${rule}`);
      expect(out).not.toContain("{{");
      // biến đã có sẵn trong mẫu: không bị nối thêm lần nữa
      expect(out.split(rule)).toHaveLength(2);
      expect(out.length).toBeLessThan(4000);
    }
  });
});
