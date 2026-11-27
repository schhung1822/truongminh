import { describe, expect, it } from "vitest";
import { buildSyncPlan, DATA_FIELDS, formatPlan, imageKeysOf, STOCK_FIELDS, type CurrentMaterial, type ExportedMaterial, type MaterialData, type MaterialsExport, type StockData } from "./sync-materials-plan";

function data(over: Partial<MaterialData> = {}): MaterialData {
  const base = Object.fromEntries(DATA_FIELDS.map((f) => [f, null])) as MaterialData;
  return { ...base, name: "Da nâu", groupName: "Da", printTech: "Khắc laser", descHuman: "", isActive: true, sortOrder: 1, needsReview: false, layer1Path: "materials/a/layer1-old.webp", layer2Path: "materials/a/layer2-old.webp", referencePath: "materials/a/reference-old.webp", ...over };
}
function stock(over: Partial<StockData> = {}): StockData {
  return { ...(Object.fromEntries(STOCK_FIELDS.map((f) => [f, null])) as StockData), allowRotate: true, ...over };
}
const mat = (code: string, d: Partial<MaterialData> = {}, s: Partial<StockData> = {}, tags: string[] = []): ExportedMaterial => ({ code, data: data(d), stock: stock(s), styleTags: tags });
const here = (id: string, m: ExportedMaterial): CurrentMaterial => ({ id, ...m });
const file = (materials: ExportedMaterial[], options: MaterialsExport["options"] = []): MaterialsExport => ({ version: 1, exportedAt: "2026-11-27T02:00:00.000Z", options, materials });
const plan = (f: MaterialsExport, current: CurrentMaterial[], extra: Partial<Parameters<typeof buildSyncPlan>[0]> = {}) => buildSyncPlan({ file: f, current, currentOptions: [], missingKeys: new Set(), withStock: false, ...extra });

describe("buildSyncPlan: chất liệu", () => {
  it("chất liệu đổi ảnh: cập nhật đúng các cột ảnh, giữ nguyên id của máy đích", () => {
    const fresh = { layer1Path: "materials/a/layer1-new.webp", referencePath: "materials/a/reference-new.webp", referenceUpdatedAt: "2026-11-25T03:00:00.000Z" };
    const p = plan(file([mat("A1", fresh)]), [here("id-here", mat("A1"))]);
    expect(p.materialOps).toEqual([{ kind: "update", id: "id-here", code: "A1", changed: ["layer1Path", "referencePath", "referenceUpdatedAt"], data: fresh, imagesChanged: true }]);
    expect(p.unchanged).toEqual([]);
  });

  it("giống hệt thì không làm gì; chỉ đổi mô tả thì không tính là đổi ảnh", () => {
    expect(plan(file([mat("A1")]), [here("x", mat("A1"))])).toMatchObject({ materialOps: [], unchanged: ["A1"] });
    const p = plan(file([mat("A1", { descHuman: "mới" })]), [here("x", mat("A1"))]);
    expect(p.materialOps[0]).toMatchObject({ kind: "update", changed: ["descHuman"], imagesChanged: false });
  });

  it("mã chưa có ở máy đích thì tạo mới kèm thông số tấm và tag; mã chỉ có ở máy đích thì để nguyên và liệt kê", () => {
    const p = plan(file([mat("MOI", {}, { stockPrice: 120000 }, ["sang-trong"])]), [here("x", mat("CU"))]);
    expect(p.materialOps).toEqual([{ kind: "create", code: "MOI", data: data(), stock: stock({ stockPrice: 120000 }), styleTags: ["sang-trong"] }]);
    expect(p.onlyHere).toEqual(["CU"]);
  });

  it("ảnh của chất liệu không có trong kho của máy đích thì BỎ QUA chất liệu đó, không ghi key chết", () => {
    const fresh = { referencePath: "materials/a/reference-new.webp" };
    const p = plan(file([mat("A1", fresh), mat("B2")]), [here("x", mat("A1"))], { missingKeys: new Set(["materials/a/reference-new.webp"]) });
    expect(p.missingFiles).toEqual([{ code: "A1", keys: ["materials/a/reference-new.webp"] }]);
    expect(p.materialOps.map((o) => o.code)).toEqual(["B2"]); // chất liệu khác vẫn được tạo
  });

  it("thông số tấm và giá: mặc định giữ của máy đích, --with-stock thì lấy theo file", () => {
    const f = file([mat("A1", {}, { stockPrice: 150000, stockWidthMm: 600 })]);
    const cur = [here("x", mat("A1", {}, { stockPrice: 120000, stockWidthMm: 600 }))];
    expect(plan(f, cur)).toMatchObject({ materialOps: [], unchanged: ["A1"] });
    const p = plan(f, cur, { withStock: true });
    expect(p.materialOps[0]).toMatchObject({ kind: "update", changed: ["stockPrice"], stock: { stockPrice: 150000 }, imagesChanged: false });
  });

  it("số ghi kiểu chữ (cột Decimal) và số thường cùng giá trị thì coi là giống; tag khác thứ tự cũng là giống", () => {
    const f = file([mat("A1", { thicknessMm: 0.5 }, { stockPrice: 120000 }, ["b", "a"])]);
    const cur = [here("x", mat("A1", { thicknessMm: 0.5 }, { stockPrice: "120000.00" }, ["a", "b"]))];
    expect(plan(f, cur, { withStock: true })).toMatchObject({ materialOps: [], unchanged: ["A1"] });
  });

  it("đổi tag phong cách thì thay cả bộ tag", () => {
    const p = plan(file([mat("A1", {}, {}, ["toi-gian"])]), [here("x", mat("A1", {}, {}, ["sang-trong"]))]);
    expect(p.materialOps[0]).toMatchObject({ kind: "update", changed: ["styleTags"], styleTags: ["toi-gian"], data: {} });
  });
});

describe("buildSyncPlan: danh mục phân loại", () => {
  const opt = (value: string, label: string, over: Partial<MaterialsExport["options"][number]> = {}) => ({ type: "TECHNIQUE", value, label, sortOrder: 0, isActive: true, ...over });

  it("thêm mục mới, sửa mục đổi nhãn/thứ tự, bỏ qua mục đã giống", () => {
    const p = buildSyncPlan({
      file: file([], [opt("khac", "Khắc laser"), opt("cat", "Cắt laser CO2"), opt("uv", "In UV")]),
      current: [],
      currentOptions: [{ id: "o1", ...opt("khac", "Khắc laser") }, { id: "o2", ...opt("cat", "Cắt laser") }],
      missingKeys: new Set(),
      withStock: false,
    });
    expect(p.optionOps).toEqual([
      { kind: "update", id: "o2", option: opt("cat", "Cắt laser CO2"), changed: ["label"] },
      { kind: "create", option: opt("uv", "In UV") },
    ]);
    expect(p.optionConflicts).toEqual([]);
  });

  it("nhãn đã thuộc một mã khác ở máy đích thì không ghi (CSDL không cho hai mã cùng nhãn), báo để sửa tay", () => {
    const p = buildSyncPlan({ file: file([], [opt("in-uv", "In UV")]), current: [], currentOptions: [{ id: "o1", ...opt("uv", "In UV") }], missingKeys: new Set(), withStock: false });
    expect(p.optionOps).toEqual([]);
    expect(p.optionConflicts).toEqual([{ option: opt("in-uv", "In UV"), takenBy: "uv" }]);
  });
});

describe("imageKeysOf / formatPlan", () => {
  it("gom mọi key ảnh trong file, không lặp", () => {
    expect(imageKeysOf(file([mat("A"), mat("B", { layer2Path: null })])).sort()).toEqual(["materials/a/layer1-old.webp", "materials/a/layer2-old.webp", "materials/a/reference-old.webp"]);
  });

  it("báo cáo nói rõ chạy thử hay đã ghi, chất liệu bị bỏ qua và chất liệu chỉ có ở máy này", () => {
    const p = plan(file([mat("A1", { referencePath: "materials/a/reference-new.webp" }), mat("LOST", { referencePath: "materials/x/gone.webp" })]), [here("x", mat("A1")), here("y", mat("RIENG"))], {
      missingKeys: new Set(["materials/x/gone.webp"]),
    });
    const dry = formatPlan(p, { applied: false, withStock: false });
    expect(dry).toContain("Sẽ tạo mới 0 chất liệu, cập nhật 1");
    expect(dry).toContain("Cập nhật A1 [đổi ảnh]: referencePath");
    expect(dry).toContain("BỎ QUA 1 chất liệu");
    expect(dry).toContain("LOST: materials/x/gone.webp");
    expect(dry).toContain("Chỉ có ở máy này, không có trong file (để nguyên): RIENG");
    expect(dry).toContain("GIỮ NGUYÊN");
    expect(formatPlan(p, { applied: true, withStock: true })).toContain("Đã tạo mới 0 chất liệu, cập nhật 1");
  });
});
