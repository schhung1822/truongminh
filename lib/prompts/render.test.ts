import { describe, expect, it } from "vitest";
import { FINISH_RULES } from "./finish";
import { buildMaterialsList, extractVariables, renderDesignPrompt, renderPrompt, styleReferenceNote, validateTemplate } from "./render";

describe("styleReferenceNote", () => {
  it("nhắc đúng số thứ tự ảnh tham chiếu và dặn không chép nội dung", () => {
    const note = styleReferenceNote(3);
    expect(note).toContain("Reference image 3");
    expect(note).toContain("Do NOT copy its logo, text, specific object shape");
  });
});

describe("renderPrompt", () => {
  it("thay đủ các biến, kể cả khi có khoảng trắng trong ngoặc và lặp biến", () => {
    const out = renderPrompt("{{cols}} cột x {{ rows }} hàng, lại {{cols}}.", { cols: 2, rows: 5 });
    expect(out).toBe("2 cột x 5 hàng, lại 2.");
  });

  it("thay được giá trị rỗng và giữ nguyên xuống dòng", () => {
    expect(renderPrompt("a{{note}}b", { note: "" })).toBe("ab");
    expect(renderPrompt("{{materials_list}}", { materials_list: "x\ny" })).toBe("x\ny");
  });

  it("không đệ quy: giá trị chứa {{...}} không bị thay lần hai", () => {
    expect(renderPrompt("{{note}}", { note: "{{cols}}" })).toBe("{{cols}}");
  });

  it("báo lỗi rõ khi thiếu giá trị cho biến", () => {
    expect(() => renderPrompt("{{product_type}}", {})).toThrow(/product_type/);
  });
});

describe("extractVariables / validateTemplate", () => {
  it("liệt kê biến không trùng", () => {
    expect(extractVariables("{{a}} {{b}} {{a}}").sort()).toEqual(["a", "b"]);
  });

  it("chấp nhận mẫu catalog hợp lệ", () => {
    expect(validateTemplate("CATALOG", "grid {{cols}}x{{rows}}\n{{materials_list}}")).toBeNull();
  });

  it("chặn biến lạ (gõ sai tên)", () => {
    expect(validateTemplate("CATALOG", "{{materials_lits}}")).toMatch(/materials_lits/);
  });

  it("mẫu catalog bắt buộc có materials_list, mẫu thiết kế thì không", () => {
    expect(validateTemplate("CATALOG", "chỉ có {{cols}}")).toMatch(/materials_list/);
    expect(validateTemplate("DESIGN", "làm {{product_type}}")).toBeNull();
  });

  it("chặn mẫu rỗng", () => {
    expect(validateTemplate("DESIGN", "   ")).toMatch(/trống/);
  });
});

describe("buildMaterialsList", () => {
  const m = (printTech: string, technique?: string) => ({ printTech, technique });
  const FRONT_BACK = "use the front and back materials shown in the two panels of the reference image";
  const FRONT_ONLY = "use ONLY the front material shown in the LEFT panel of the reference image";

  it("ô 1 ứng với ảnh tham chiếu 2 (ảnh 1 là logo), đúng thứ tự, mỗi ô kèm kiểu hoàn thiện", () => {
    const list = buildMaterialsList([m("UV print"), m("laser engraving")], {
      cols: 1,
      rows: 2,
    });
    expect(list).toBe(
      [
        `Cell 1 = reference image 2: ${FRONT_BACK}, technique: UV print. Finish: ${FINISH_RULES.PRINT}`,
        `Cell 2 = reference image 3: ${FRONT_BACK}, technique: laser engraving. Finish: ${FINISH_RULES.ENGRAVE}`,
      ].join("\n"),
    );
  });

  it("hàng cắt laser chỉ dùng nửa trái (mặt trước), không dùng mặt sau làm viền", () => {
    const list = buildMaterialsList([m("Cắt laser", "cat-laser"), m("Khắc laser", "khac-laser")], { cols: 1, rows: 2 });
    const [cut, engrave] = list.split("\n");
    expect(cut).toBe(`Cell 1 = reference image 2: ${FRONT_ONLY}, technique: Cắt laser. Finish: ${FINISH_RULES.CUT}`);
    expect(cut).toMatch(/NO border or rim/);
    expect(engrave).toBe(`Cell 2 = reference image 3: ${FRONT_BACK}, technique: Khắc laser. Finish: ${FINISH_RULES.ENGRAVE}`);
    expect(engrave).not.toMatch(/NO border/);
  });

  it("trang trộn khắc, cắt, in: mỗi ô đúng kiểu của nó", () => {
    const list = buildMaterialsList([m("Khắc laser", "khac-laser"), m("Cắt laser", "cat-laser"), m("In UV", "in-uv")], { cols: 3, rows: 1 });
    const lines = list.split("\n");
    expect(lines[0]).toContain(FINISH_RULES.ENGRAVE);
    expect(lines[1]).toContain(FINISH_RULES.CUT);
    expect(lines[2]).toContain(FINISH_RULES.PRINT);
  });

  it("đủ 10 chất liệu thì không có dòng dặn để trống, ô cuối là ảnh 11", () => {
    const list = buildMaterialsList(Array.from({ length: 10 }, () => m("y")), { cols: 2, rows: 5 });
    const lines = list.split("\n");
    expect(lines).toHaveLength(10);
    expect(lines[9]).toMatch(/^Cell 10 = reference image 11:/);
  });

  it("trang chưa đầy: dặn AI để trống các ô còn lại", () => {
    const list = buildMaterialsList(Array.from({ length: 6 }, () => m("y")), { cols: 2, rows: 5 });
    expect(list.split("\n").at(-1)).toBe("Cells 7 to 10: leave completely empty (plain white).");
    const one = buildMaterialsList(Array.from({ length: 9 }, () => m("y")), { cols: 2, rows: 5 });
    expect(one.split("\n").at(-1)).toBe("Cell 10: leave completely empty (plain white).");
  });

  it("gộp khoảng trắng và xuống dòng trong tên công nghệ in", () => {
    const list = buildMaterialsList([m("  UV\n  print ")], { cols: 1, rows: 1 });
    expect(list).toBe(`Cell 1 = reference image 2: ${FRONT_BACK}, technique: UV print. Finish: ${FINISH_RULES.PRINT}`);
  });
});

describe("renderDesignPrompt", () => {
  const values = { product_type: "móc khóa", design_style: "tối giản", note: "none" };

  it("mẫu có {{material_finish}}: câu dặn nằm đúng chỗ đó, không nối thêm", () => {
    const out = renderDesignPrompt("A {{product_type}}\nFinish: {{material_finish}}\nStyle: {{design_style}}", values, FINISH_RULES.CUT);
    expect(out).toBe(`A móc khóa\nFinish: ${FINISH_RULES.CUT}\nStyle: tối giản`);
  });

  it("mẫu cũ chưa có biến: câu dặn tự được nối vào cuối", () => {
    const out = renderDesignPrompt("A {{product_type}} in {{design_style}}. {{note}}", values, FINISH_RULES.CUT);
    expect(out.startsWith("A móc khóa in tối giản. none")).toBe(true);
    expect(out.endsWith(FINISH_RULES.CUT)).toBe(true);
    expect(out).toMatch(/overrides any conflicting detail above/);
    expect(out).not.toContain("{{");
  });

  it("material_finish là biến hợp lệ khi lưu mẫu", () => {
    expect(validateTemplate("DESIGN", "x {{material_finish}} {{note}}")).toBeNull();
  });
});
