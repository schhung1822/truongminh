import { describe, expect, it } from "vitest";
import { normalizeClassification, parseColorCount, requireBasics } from "./classify";
import { DEFAULT_OPTIONS, OPTION_TYPES, resolveOption, type OptionRow } from "./option-types";

const options: OptionRow[] = OPTION_TYPES.flatMap((type) => DEFAULT_OPTIONS[type].map((o, i) => ({ type, value: o.value, label: o.label, sortOrder: i, isActive: true })));
const off = (type: OptionRow["type"], value: string): OptionRow[] => options.map((o) => (o.type === type && o.value === value ? { ...o, isActive: false } : o));

describe("resolveOption", () => {
  it("khớp theo value hoặc nhãn, bỏ qua hoa thường và dấu", () => {
    expect(resolveOption(options, "TECHNIQUE", "khac-laser")).toBe("khac-laser");
    expect(resolveOption(options, "TECHNIQUE", "Khắc laser")).toBe("khac-laser");
    expect(resolveOption(options, "SURFACE_FINISH", "anh kim / xuoc")).toBe("anh-kim-xuoc");
    expect(resolveOption(options, "COLOR_FAMILY", "ĐEN")).toBe("den");
  });

  it("giá trị lạ hoặc đã tắt thì null, trừ khi đang là giá trị hiện có", () => {
    expect(resolveOption(options, "TECHNIQUE", "in 3d")).toBeNull();
    expect(resolveOption(off("TECHNIQUE", "in-uv"), "TECHNIQUE", "in-uv")).toBeNull();
    expect(resolveOption(off("TECHNIQUE", "in-uv"), "TECHNIQUE", "in-uv", "in-uv")).toBe("in-uv");
  });
});

describe("normalizeClassification", () => {
  it("ghi song song groupName và printTech bằng nhãn của baseMaterial và technique", () => {
    const r = normalizeClassification({ baseMaterial: "gia-guong", technique: "cat-laser" }, options);
    expect(r.errors).toEqual([]);
    expect(r.scalar).toMatchObject({ baseMaterial: "gia-guong", groupName: "Giả gương", technique: "cat-laser", printTech: "Cắt laser" });
  });

  it("trường không có trong patch thì không xuất hiện (giữ nguyên); null hoặc trống thì xóa", () => {
    const r = normalizeClassification({ surfaceFinish: null, surfacePattern: "  " }, options);
    expect(r.scalar).toEqual({ surfaceFinish: null, surfacePattern: null });
    expect("baseMaterial" in r.scalar).toBe(false);
  });

  it("giá trị không có trong danh mục thì báo lỗi, không ghi", () => {
    const r = normalizeClassification({ baseMaterial: "Kim loại", surfaceFinish: "mo" }, options);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/Nhóm chất liệu/);
    expect("baseMaterial" in r.scalar).toBe(false);
    expect(r.scalar.surfaceFinish).toBe("mo");
  });

  it("số màu, độ tin cậy, vấn đề ảnh, cần xem lại", () => {
    const r = normalizeClassification(
      { colorCount: "2 màu", frontColorConfidence: "thấp", classifyConfidence: "trung_binh", photoIssue: "co tay|CO_THUOC", needsReview: "TRUE" },
      options,
    );
    expect(r.errors).toEqual([]);
    expect(r.scalar).toMatchObject({ colorCount: "TWO", frontColorConfidence: "THAP", classifyConfidence: "TRUNG_BINH", needsReview: true });
    expect(r.scalar.photoIssue).toBe("CO_THUOC|CO_TAY"); // theo thứ tự chuẩn
    expect(normalizeClassification({ colorCount: "ba màu" }, options).errors[0]).toMatch(/Số màu/);
    expect(normalizeClassification({ photoIssue: "hỏng" }, options).errors[0]).toMatch(/Vấn đề ảnh/);
  });

  it("tag phong cách: nhận a|b, bỏ trùng, báo lỗi tag lạ; tag đã tắt thì giữ nếu chất liệu đang dùng", () => {
    const ok = normalizeClassification({ styleTags: "toi-gian|Sang trọng|toi-gian" }, options);
    expect(ok.styleTags).toEqual(["toi-gian", "sang-trong"]);
    expect(normalizeClassification({ styleTags: ["lạ"] }, options).errors[0]).toMatch(/Phong cách/);
    const disabled = off("STYLE_TAG", "moc-mac");
    expect(normalizeClassification({ styleTags: ["moc-mac"] }, disabled).errors).toHaveLength(1);
    expect(normalizeClassification({ styleTags: ["moc-mac"] }, disabled, { styleTags: ["moc-mac"] }).styleTags).toEqual(["moc-mac"]);
    expect(normalizeClassification({ styleTags: null }, options).styleTags).toEqual([]);
  });

  it("giới hạn độ dài các ô chữ", () => {
    expect(normalizeClassification({ aiVisualNote: "x".repeat(1001) }, options).errors).toHaveLength(1);
    expect(normalizeClassification({ frontColorName: "x".repeat(101) }, options).errors).toHaveLength(1);
  });
});

describe("requireBasics / parseColorCount", () => {
  it("bắt buộc có nhóm chất liệu và công nghệ in (từ patch hoặc giá trị hiện có)", () => {
    expect(requireBasics({})).toHaveLength(2);
    expect(requireBasics({ baseMaterial: "nhua", technique: "in-uv" })).toEqual([]);
    expect(requireBasics({}, { baseMaterial: "nhua", technique: "in-uv" })).toEqual([]);
    expect(requireBasics({ technique: null }, { baseMaterial: "nhua", technique: "in-uv" })).toHaveLength(1);
  });

  it("đọc số màu nhiều kiểu", () => {
    expect(["1", "1 màu", "ONE", "một màu"].map(parseColorCount)).toEqual(["ONE", "ONE", "ONE", "ONE"]);
    expect(["2", "2 màu", "two", "hai"].map(parseColorCount)).toEqual(["TWO", "TWO", "TWO", "TWO"]);
    expect(parseColorCount("3")).toBeNull();
  });
});
