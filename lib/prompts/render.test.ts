import { describe, expect, it } from "vitest";
import { buildMaterialsList, extractVariables, renderPrompt, validateTemplate } from "./render";

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
  const m = (descAi: string, printTech: string) => ({ descAi, printTech });

  it("ô 1 ứng với ảnh tham chiếu 2 (ảnh 1 là logo), đúng thứ tự", () => {
    const list = buildMaterialsList([m("white canvas", "UV print"), m("black acrylic", "laser engraving")], {
      cols: 1,
      rows: 2,
    });
    expect(list).toBe(
      [
        "Cell 1 = reference image 2: white canvas, technique: UV print",
        "Cell 2 = reference image 3: black acrylic, technique: laser engraving",
      ].join("\n"),
    );
  });

  it("đủ 10 chất liệu thì không có dòng dặn để trống, ô cuối là ảnh 11", () => {
    const list = buildMaterialsList(Array.from({ length: 10 }, () => m("x", "y")), { cols: 2, rows: 5 });
    const lines = list.split("\n");
    expect(lines).toHaveLength(10);
    expect(lines[9]).toMatch(/^Cell 10 = reference image 11:/);
  });

  it("trang chưa đầy: dặn AI để trống các ô còn lại", () => {
    const list = buildMaterialsList(Array.from({ length: 6 }, () => m("x", "y")), { cols: 2, rows: 5 });
    expect(list.split("\n").at(-1)).toBe("Cells 7 to 10: leave completely empty (plain white).");
    const one = buildMaterialsList(Array.from({ length: 9 }, () => m("x", "y")), { cols: 2, rows: 5 });
    expect(one.split("\n").at(-1)).toBe("Cell 10: leave completely empty (plain white).");
  });

  it("gộp xuống dòng trong mô tả và có mô tả dự phòng khi trống", () => {
    const list = buildMaterialsList([m("line one\n  line two", "UV"), m("", "UV")], { cols: 2, rows: 1 });
    const lines = list.split("\n");
    expect(lines[0]).toBe("Cell 1 = reference image 2: line one line two, technique: UV");
    expect(lines[1]).toMatch(/match the material shown/);
  });
});
