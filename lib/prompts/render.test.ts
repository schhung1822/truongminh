import { describe, expect, it } from "vitest";
import { finishRule } from "./finish";
import { buildMaterialsList, extractVariables, renderDesignPrompt, renderPrompt, styleReferenceNote, validateTemplate } from "./render";

describe("styleReferenceNote", () => {
  it("nhắc đúng số thứ tự ảnh tham chiếu và dặn không chép nội dung (một ảnh)", () => {
    const note = styleReferenceNote(3);
    expect(note).toContain("Reference image 3");
    expect(note).toContain("Do NOT copy its logo, text, specific object shape");
  });

  it("nhiều ảnh: nhắc đúng khoảng số thứ tự, số ít -> số nhiều", () => {
    const note = styleReferenceNote(3, 3);
    expect(note).toContain("Reference images 3-5");
    expect(note).toContain("Do NOT copy their logo, text, specific object shape");
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
  const cellLines = (list: string) => list.split("\n").filter((l) => /^Cells? \d/.test(l));
  const typeLines = (list: string) => list.split("\n").filter((l) => l.startsWith("- "));

  it("định nghĩa mỗi kiểu hàng đúng MỘT lần ở đầu, mỗi ô chỉ một dòng ngắn ghi kiểu theo công nghệ của chất liệu", () => {
    const list = buildMaterialsList([m("Cắt laser", "cat-laser"), m("Khắc laser", "khac-laser"), m("Khắc laser", "khac-laser")], { cols: 1, rows: 3 });
    expect(typeLines(list)).toEqual([`- ENGRAVED = ${finishRule("ENGRAVE")}`, `- CUT-ONLY = ${finishRule("CUT")}`]);
    expect(cellLines(list)).toEqual([
      "Cell 1 (row 1, column 1) = reference image 2, type CUT-ONLY (technique: Cắt laser)",
      "Cell 2 (row 2, column 1) = reference image 3, type ENGRAVED (technique: Khắc laser)",
      "Cell 3 (row 3, column 1) = reference image 4, type ENGRAVED (technique: Khắc laser)",
    ]);
    expect(list.split(finishRule("ENGRAVE"))).toHaveLength(2);
    expect(list).toMatch(/never choose it from how the material looks or from the cell's position/);
  });

  it("kiểu của ô theo công nghệ chất liệu chứ không theo vị trí: 5 khắc rồi 3 cắt vẫn ra đúng từng ô", () => {
    const mats = [...Array.from({ length: 5 }, () => m("Khắc laser", "khac-laser")), ...Array.from({ length: 3 }, () => m("Cắt laser", "cat-laser"))];
    const lines = cellLines(buildMaterialsList(mats, { cols: 2, rows: 4 }));
    expect(lines.map((l) => (l.includes("type ENGRAVED") ? "E" : l.includes("type CUT-ONLY") ? "C" : "?")).join("")).toBe("EEEEECCC");
  });

  it("chỉ định nghĩa kiểu hàng có mặt trong ảnh", () => {
    const onlyCut = buildMaterialsList([m("Cắt laser", "cat-laser")], { cols: 1, rows: 1 });
    expect(typeLines(onlyCut)).toEqual([`- CUT-ONLY = ${finishRule("CUT")}`]);
    const onlyEngrave = buildMaterialsList([m("Khắc laser", "khac-laser")], { cols: 1, rows: 1 });
    expect(typeLines(onlyEngrave)).toEqual([`- ENGRAVED = ${finishRule("ENGRAVE")}`]);
  });

  it("logo dạng huy hiệu (D113): hàng khắc dùng câu giữ hình bảng, hàng cắt dùng câu bỏ nền và khung", () => {
    const list = buildMaterialsList([m("Khắc laser", "khac-laser"), m("Cắt laser", "cat-laser")], { cols: 2, rows: 1 }, { badge: true });
    expect(typeLines(list)).toEqual([`- ENGRAVED = ${finishRule("ENGRAVE", true)}`, `- CUT-ONLY = ${finishRule("CUT", true)}`]);
    expect(list).toMatch(/keeps the logo's badge shape/);
  });

  it("8 ô lưới 2x4: ô 7 và 8 (hàng cuối) có đúng hàng/cột khác nhau để AI không tráo nhầm", () => {
    const lines = cellLines(buildMaterialsList(Array.from({ length: 8 }, () => m("y")), { cols: 2, rows: 4 }));
    expect(lines[6]).toMatch(/^Cell 7 \(row 4, column 1\) = reference image 8,/);
    expect(lines[7]).toMatch(/^Cell 8 \(row 4, column 2\) = reference image 9,/);
  });

  it("đủ 10 chất liệu thì không có dòng dặn để trống, ô cuối là ảnh 11", () => {
    const lines = cellLines(buildMaterialsList(Array.from({ length: 10 }, () => m("y")), { cols: 2, rows: 5 }));
    expect(lines).toHaveLength(10);
    expect(lines[9]).toMatch(/^Cell 10 \(row 5, column 2\) = reference image 11,/);
  });

  it("trang chưa đầy: dặn AI để trống các ô còn lại", () => {
    const list = buildMaterialsList(Array.from({ length: 6 }, () => m("y")), { cols: 2, rows: 5 });
    expect(list.split("\n").at(-1)).toBe("Cells 7 to 10: leave completely empty (plain white).");
    const one = buildMaterialsList(Array.from({ length: 9 }, () => m("y")), { cols: 2, rows: 5 });
    expect(one.split("\n").at(-1)).toBe("Cell 10: leave completely empty (plain white).");
  });

  it("gộp khoảng trắng và xuống dòng trong tên công nghệ in", () => {
    const lines = cellLines(buildMaterialsList([m("  Khắc\n  laser ")], { cols: 1, rows: 1 }));
    expect(lines).toEqual(["Cell 1 (row 1, column 1) = reference image 2, type ENGRAVED (technique: Khắc laser)"]);
  });
});

describe("renderDesignPrompt", () => {
  const values = { product_type: "móc khóa", design_style: "tối giản", note: "none" };
  const CUT = finishRule("CUT");

  it("mẫu có {{material_finish}}: câu dặn nằm đúng chỗ đó, không nối thêm", () => {
    const out = renderDesignPrompt("A {{product_type}}\nFinish: {{material_finish}}\nStyle: {{design_style}}", values, CUT);
    expect(out).toBe(`A móc khóa\nFinish: ${CUT}\nStyle: tối giản`);
  });

  it("mẫu cũ chưa có biến: câu dặn tự được nối vào cuối", () => {
    const out = renderDesignPrompt("A {{product_type}} in {{design_style}}. {{note}}", values, CUT);
    expect(out.startsWith("A móc khóa in tối giản. none")).toBe(true);
    expect(out.endsWith(CUT)).toBe(true);
    expect(out).toMatch(/overrides any conflicting detail above/);
    expect(out).not.toContain("{{");
  });

  it("material_finish là biến hợp lệ khi lưu mẫu", () => {
    expect(validateTemplate("DESIGN", "x {{material_finish}} {{note}}")).toBeNull();
  });
});
