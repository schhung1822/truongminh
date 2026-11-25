import { describe, expect, it } from "vitest";
import { MATERIAL_CSV_COLUMNS, parseMaterialsCsv } from "@/lib/csv/materials";
import { csvLine } from "@/lib/stats/csv";
import { materialCsvCell } from "./export-cells";
import { countStockChanges, planMaterialsImport, summarizePlan, type ExistingMaterial } from "./import-plan";
import { DEFAULT_OPTIONS, OPTION_TYPES, type OptionRow } from "./option-types";

const options: OptionRow[] = OPTION_TYPES.flatMap((type) => DEFAULT_OPTIONS[type].map((o, i) => ({ type, value: o.value, label: o.label, sortOrder: i, isActive: true })));

const mat = (over: Partial<ExistingMaterial> = {}): ExistingMaterial => ({
  id: "id1", code: "ZY-15", name: "ZY 15", descHuman: "", thicknessMm: 0.74, isActive: true, sortOrder: 5, groupName: "Nhựa", printTech: "Khắc laser",
  baseMaterial: "nhua", technique: "khac-laser", surfaceFinish: null, surfacePattern: null, colorCount: null, frontColorName: null, frontColorFamily: null,
  frontColorConfidence: null, backColorName: null, backColorFamily: null, backColorConfidence: null, seriesCode: null, aiVisualNote: null, photoIssue: null,
  classifyConfidence: null, needsReview: false, reviewNote: null, styleTags: [],
  stockWidthMm: null, stockHeightMm: null, stockPrice: null, edgeMarginMm: null, gapMm: null, allowRotate: true, ...over,
});

/** chất liệu đã có đủ thông số tấm (mm, đồng) */
const stocked = (over: Partial<ExistingMaterial> = {}) => mat({ stockWidthMm: 600, stockHeightMm: 400, stockPrice: 1500000, edgeMarginMm: 5, gapMm: 3, allowRotate: true, ...over });

const plan = (csv: string, existing: ExistingMaterial[], mode: "create-only" | "upsert" = "upsert") =>
  planMaterialsImport(parseMaterialsCsv(csv).rows, existing, options, mode, 100);

describe("planMaterialsImport: cập nhật", () => {
  it("khớp theo mã, chỉ ghi các cột thật sự đổi, ô trống giữ nguyên", () => {
    const p = plan("code,surfaceFinish,surfacePattern,descHuman\nzy-15,mo,,\n", [mat()]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ kind: "update", id: "id1", data: { surfaceFinish: "mo" }, changed: ["surfaceFinish"] });
  });

  it("giá trị y hệt hiện có thì 'không đổi'", () => {
    const p = plan("code,baseMaterial,thicknessMm\nZY-15,nhua,0.74\n", [mat()]);
    expect(p[0].kind).toBe("unchanged");
  });

  it("khớp theo id trước, nên đổi được mã; trùng mã với chất liệu khác thì lỗi", () => {
    const ok = plan("id,code\nid1,ZY-15-MOI\n", [mat()]);
    expect(ok[0]).toMatchObject({ kind: "update", data: { code: "ZY-15-MOI" } });
    const clash = plan("id,code\nid1,H0006\n", [mat(), mat({ id: "id2", code: "H0006" })]);
    expect(clash[0]).toMatchObject({ kind: "error" });
    const missing = plan("id,code\nkhong-co,X\n", [mat()]);
    expect(missing[0]).toMatchObject({ kind: "error" });
  });

  it("[xoa] xóa giá trị; baseMaterial đổi thì groupName đổi theo", () => {
    const p = plan("code,surfaceFinish,baseMaterial\nZY-15,[xoa],vai\n", [mat({ surfaceFinish: "mo" })]);
    expect(p[0]).toMatchObject({ kind: "update", data: { surfaceFinish: null, baseMaterial: "vai", groupName: "Vải" } });
  });

  it("tag phong cách: đổi thì có styleTags, giống nhau (khác thứ tự) thì bỏ qua", () => {
    const diff = plan("code,styleTags\nZY-15,toi-gian|sang-trong\n", [mat({ styleTags: ["toi-gian"] })]);
    expect(diff[0]).toMatchObject({ kind: "update", styleTags: ["toi-gian", "sang-trong"] });
    const same = plan("code,styleTags\nZY-15,sang-trong|toi-gian\n", [mat({ styleTags: ["toi-gian", "sang-trong"] })]);
    expect(same[0].kind).toBe("unchanged");
  });

  it("giá trị không có trong danh mục, độ dày sai: báo lỗi dòng đó, các dòng khác vẫn chạy", () => {
    const p = plan("code,surfaceFinish,thicknessMm\nA,lạ,\nB,mo,dày\nC,mo,0.5\n", [mat({ code: "A", id: "a" }), mat({ code: "B", id: "b" }), mat({ code: "C", id: "c" })]);
    expect(p.map((x) => x.kind)).toEqual(["error", "error", "update"]);
    expect(summarizePlan(p)).toEqual({ created: 0, updated: 1, unchanged: 0, skipped: 0, errors: 2 });
  });
});

describe("planMaterialsImport: thêm mới và chế độ chỉ thêm", () => {
  it("chưa có mã thì thêm mới, cần tên; nhóm/công nghệ in lấy từ nhãn trong file cũ", () => {
    const p = plan("code,name,nhóm,công nghệ in\nN1,Nhựa mới,Nhựa,Cắt laser\nN2,,Nhựa,Cắt laser\n", []);
    expect(p[0]).toMatchObject({ kind: "create", data: { code: "N1", name: "Nhựa mới", baseMaterial: "nhua", groupName: "Nhựa", technique: "cat-laser", printTech: "Cắt laser", sortOrder: 100 } });
    expect(p[1]).toMatchObject({ kind: "error" });
  });

  it("thêm mới mà chưa chọn được nhóm/công nghệ in thì đánh dấu cần xem lại", () => {
    const p = plan("code,name\nN1,Mới\n", []);
    expect(p[0]).toMatchObject({ kind: "create", data: { groupName: "Chưa phân nhóm", printTech: "Chưa rõ", needsReview: true } });
  });

  it("thêm mới không có cột mô tả thì mô tả là chuỗi rỗng (cột bắt buộc ở CSDL)", () => {
    const p = plan("code,name,baseMaterial,technique\nN1,Mới,nhua,cat-laser\n", []);
    expect(p[0]).toMatchObject({ kind: "create", data: { descHuman: "" } });
  });

  it("nhóm ghi chữ không có trong danh mục thì báo lỗi, không tự tạo nhóm", () => {
    const p = plan("code,name,nhóm,công nghệ in\nN1,Mới,Kim loại,Cắt laser\n", []);
    expect(p[0].kind).toBe("error");
  });

  it("chế độ chỉ thêm: mã đã có thì bỏ qua và không ghi đè, id bị bỏ qua", () => {
    const p = plan("id,code,name\nid1,ZY-15,Tên khác\n,MOI,Chất liệu mới\n", [mat()], "create-only");
    expect(p[0]).toMatchObject({ kind: "skip" });
    expect(p[1]).toMatchObject({ kind: "create" });
  });

  it("hai dòng cùng tạo một mã thì dòng sau lỗi (qua parser: bị loại vì lặp)", () => {
    const parsed = parseMaterialsCsv("code,name\nA,Một\na,Hai\n");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors).toHaveLength(1);
  });
});

const updateOf = (p: ReturnType<typeof plan>[number]) => {
  if (p.kind !== "update") throw new Error(`cần kind "update", nhận "${p.kind}"`);
  return p;
};

describe("planMaterialsImport: thông số tấm", () => {
  it("đọc cột mới, chỉ đổi trường có trong CSV; ô trống giữ giá trị hiện có và không ghi thẳng vào data", () => {
    const p = plan("code,stockWidthMm,stockHeightMm,stockPrice,edgeMarginMm,gapMm,allowRotate\nZY-15,,,1600000,,,\n", [stocked()]);
    const u = updateOf(p[0]);
    expect(u.data).toEqual({});
    expect(u.changed).toEqual(["stockPrice"]);
    expect(u.stock).toEqual({
      changed: ["stockPrice"],
      input: { stockWidthMm: 600, stockHeightMm: 400, stockPrice: 1600000, edgeMarginMm: 5, gapMm: 3, allowRotate: true },
    });
  });

  it("đặt đủ 6 trường cho chất liệu chưa có dữ liệu tấm (allowRotate đọc đúng TRUE/FALSE)", () => {
    const p = plan("code,stockWidthMm,stockHeightMm,stockPrice,edgeMarginMm,gapMm,allowRotate\nZY-15,600,400,1500000,5,3,FALSE\n", [mat()]);
    const u = updateOf(p[0]);
    expect(u.stock?.input).toEqual({ stockWidthMm: 600, stockHeightMm: 400, stockPrice: 1500000, edgeMarginMm: 5, gapMm: 3, allowRotate: false });
    expect(u.stock?.changed).toEqual(["stockWidthMm", "stockHeightMm", "stockPrice", "edgeMarginMm", "gapMm", "allowRotate"]);
    expect(Object.keys(u.data).some((k) => k.startsWith("stock") || k === "gapMm" || k === "edgeMarginMm" || k === "allowRotate")).toBe(false);
  });

  it("allowRotate nhận TRUE/FALSE, có/không; chỉ đổi khi khác hiện có", () => {
    expect(updateOf(plan("code,allowRotate\nZY-15,FALSE\n", [stocked()])[0]).stock?.changed).toEqual(["allowRotate"]);
    expect(updateOf(plan("code,allowRotate\nZY-15,có\n", [stocked({ allowRotate: false })])[0]).stock?.input.allowRotate).toBe(true);
    expect(updateOf(plan("code,allowRotate\nZY-15,không\n", [stocked()])[0]).stock?.input.allowRotate).toBe(false);
    expect(plan("code,allowRotate\nZY-15,TRUE\n", [stocked()])[0].kind).toBe("unchanged");
  });

  it("giá trị y hệt hiện có thì 'không đổi' và không có kế hoạch ghi tấm", () => {
    const p = plan("code,stockWidthMm,stockHeightMm,stockPrice,edgeMarginMm,gapMm,allowRotate\nZY-15,600,400,1500000,5,3,TRUE\n", [stocked()]);
    expect(p[0].kind).toBe("unchanged");
    expect(countStockChanges(p)).toBe(0);
  });

  it("[xoa] đặt null (chưa có dữ liệu); xóa ô vốn đã trống thì không đổi", () => {
    const u = updateOf(plan("code,stockPrice,gapMm\nZY-15,[xoa],[xoa]\n", [stocked()])[0]);
    expect(u.stock?.input).toMatchObject({ stockPrice: null, gapMm: null, stockWidthMm: 600 });
    expect(u.stock?.changed).toEqual(["stockPrice", "gapMm"]);
    expect(plan("code,gapMm\nZY-15,[xoa]\n", [mat()])[0].kind).toBe("unchanged");
  });

  it("số 0 là số thật (lề, khoảng cách), không bị coi là trống", () => {
    const u = updateOf(plan("code,edgeMarginMm,gapMm\nZY-15,0,0\n", [stocked()])[0]);
    expect(u.stock?.input).toMatchObject({ edgeMarginMm: 0, gapMm: 0 });
  });

  it("nhận dấu phẩy thập phân kiểu Việt Nam và làm tròn giá về 2 chữ số thập phân", () => {
    const a = updateOf(plan('code,stockWidthMm,stockPrice\nZY-15,"599,5",1500000.456\n', [stocked()])[0]);
    expect(a.stock?.input).toMatchObject({ stockWidthMm: 599.5, stockPrice: 1500000.46 });
  });

  it("số sai hoặc ngoài khoảng: báo lỗi đúng dòng, nêu rõ cột; các dòng tốt vẫn chạy", () => {
    const csv = [
      "code,stockWidthMm,stockPrice,edgeMarginMm,gapMm,allowRotate",
      "A,abc,,,,", // dòng 2: không phải số
      "B,0,,,,", // dòng 3: kích thước phải > 0
      "C,,-5,,,", // dòng 4: giá phải > 0
      "D,,,-1,,", // dòng 5: lề không âm
      "E,,,,,maybe", // dòng 6: allowRotate lạ
      "F,,,,,[xoa]", // dòng 7: allowRotate không xóa được
      "G,600,1500000,5,3,TRUE", // dòng 8: tốt
    ].join("\n");
    const existing = ["A", "B", "C", "D", "E", "F", "G"].map((c) => mat({ id: `id-${c}`, code: c }));
    const p = plan(csv, existing);
    expect(p.map((x) => x.kind)).toEqual(["error", "error", "error", "error", "error", "error", "update"]);
    expect(p.map((x) => x.line)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    const msg = (i: number) => (p[i].kind === "error" ? (p[i] as { message: string }).message : "");
    expect(msg(0)).toContain("stockWidthMm");
    expect(msg(1)).toMatch(/lớn hơn 0.*stockWidthMm/);
    expect(msg(2)).toContain("stockPrice");
    expect(msg(3)).toContain("edgeMarginMm");
    expect(msg(4)).toContain("allowRotate");
    expect(msg(5)).toContain("allowRotate");
    expect(summarizePlan(p)).toEqual({ created: 0, updated: 1, unchanged: 0, skipped: 0, errors: 6 });
  });

  it("thêm mới: có cột tấm thì có kế hoạch lưu tấm (phần không có là chưa có dữ liệu, allowRotate mặc định TRUE); không có thì không", () => {
    const csv = ["code,name,baseMaterial,technique,stockWidthMm,stockHeightMm,stockPrice,edgeMarginMm", "N1,Mới,nhua,cat-laser,600,400,1500000,5", "N2,Không tấm,nhua,cat-laser,,,,", "N3,Xóa suông,nhua,cat-laser,[xoa],,,"].join("\n");
    const p = plan(csv, []);
    expect(p.map((x) => x.kind)).toEqual(["create", "create", "create"]);
    const c = p[0] as Extract<(typeof p)[number], { kind: "create" }>;
    expect(c.stock).toEqual({
      changed: ["stockWidthMm", "stockHeightMm", "stockPrice", "edgeMarginMm"],
      input: { stockWidthMm: 600, stockHeightMm: 400, stockPrice: 1500000, edgeMarginMm: 5, gapMm: null, allowRotate: true },
    });
    expect(Object.keys(c.data).some((k) => k.startsWith("stock") || k === "edgeMarginMm")).toBe(false);
    expect((p[1] as { stock?: unknown }).stock).toBeUndefined();
    expect((p[2] as { stock?: unknown }).stock).toBeUndefined();
    expect(countStockChanges(p)).toBe(1);
  });

  it("thêm mới có số tấm sai thì lỗi dòng đó, không tạo", () => {
    const p = plan("code,name,baseMaterial,technique,stockPrice\nN1,Mới,nhua,cat-laser,rẻ\n", []);
    expect(p[0]).toMatchObject({ kind: "error", line: 2 });
  });

  it("file CSV cũ (không có 6 cột mới) nhập y như trước: không đụng tới thông số tấm", () => {
    const p = plan("code,surfaceFinish\nZY-15,mo\n", [stocked()]);
    const u = updateOf(p[0]);
    expect(u.stock).toBeUndefined();
    expect(u.changed).toEqual(["surfaceFinish"]);
    expect(countStockChanges(p)).toBe(0);
    const created = plan("code,name,nhóm,công nghệ in\nN1,Nhựa mới,Nhựa,Cắt laser\n", []);
    expect(created[0]).toMatchObject({ kind: "create", data: { code: "N1", technique: "cat-laser" } });
    expect((created[0] as { stock?: unknown }).stock).toBeUndefined();
  });

  it("khớp theo id cũng đổi được tấm; chế độ chỉ thêm thì bỏ qua mã đã có", () => {
    expect(updateOf(plan("id,stockWidthMm\nid1,500\n", [stocked()])[0]).stock?.changed).toEqual(["stockWidthMm"]);
    expect(plan("code,stockPrice\nZY-15,1\n", [stocked()], "create-only")[0].kind).toBe("skip");
  });

  it("vừa đổi cột thường vừa đổi tấm: cả hai cùng nằm trong một dòng cập nhật", () => {
    const u = updateOf(plan("code,surfaceFinish,gapMm\nZY-15,mo,4\n", [stocked()])[0]);
    expect(u.data).toEqual({ surfaceFinish: "mo" });
    expect(u.changed).toEqual(["surfaceFinish", "gapMm"]);
    expect(u.stock?.input.gapMm).toBe(4);
  });
});

describe("xuất rồi nhập lại (round trip)", () => {
  const exported: ExistingMaterial[] = [
    stocked({
      id: "a", code: "A-1", name: 'Nhựa, đen "mờ"', stockPrice: 1500000.5, stockWidthMm: 297.5, allowRotate: false, styleTags: ["toi-gian", "sang-trong"],
      surfaceFinish: "mo", colorCount: "TWO", needsReview: true, reviewNote: "xem lại",
    }),
    mat({ id: "b", code: "B-2", name: "Vải", thicknessMm: 0.5, sortOrder: 7 }), // chưa có dữ liệu tấm: các ô tấm để trống, allowRotate TRUE
    stocked({ id: "c", code: "C-3", name: "Mica", edgeMarginMm: 0, gapMm: 0 }), // 0 là số thật, không phải trống
  ];
  const toCsv = (rows: ExistingMaterial[]) =>
    "﻿" + [csvLine([...MATERIAL_CSV_COLUMNS]), ...rows.map((r) => csvLine(MATERIAL_CSV_COLUMNS.map((f) => materialCsvCell(r, f))))].join("\r\n") + "\r\n";

  it("file xuất ra có 6 cột tấm đúng đơn vị lưu trữ và đúng giá trị (giá là số thường, không dấu ngăn nghìn)", () => {
    const parsed = parseMaterialsCsv(toCsv(exported));
    expect(parsed.errors).toEqual([]);
    expect(parsed.columns).toHaveLength(MATERIAL_CSV_COLUMNS.length);
    const a = parsed.rows[0].values;
    expect(a).toMatchObject({ stockWidthMm: "297.5", stockHeightMm: "400", stockPrice: "1500000.5", edgeMarginMm: "5", gapMm: "3", allowRotate: "FALSE" });
    const b = parsed.rows[1].values;
    expect(b.stockWidthMm).toBeUndefined(); // ô trống
    expect(b.stockPrice).toBeUndefined();
    expect(b.allowRotate).toBe("TRUE");
    expect(parsed.rows[2].values).toMatchObject({ edgeMarginMm: "0", gapMm: "0" });
  });

  it("nhập lại chính file vừa xuất thì mọi dòng 'không đổi', không có kế hoạch ghi tấm", () => {
    const p = plan(toCsv(exported), exported);
    expect(p.map((x) => x.kind)).toEqual(["unchanged", "unchanged", "unchanged"]);
    expect(countStockChanges(p)).toBe(0);
  });

  it("sửa một ô tấm trong file xuất rồi nhập lại thì chỉ dòng đó đổi và chỉ trường đó đổi", () => {
    const edited = toCsv(exported).replace("1500000.5", "1600000");
    const p = plan(edited, exported);
    expect(p.map((x) => x.kind)).toEqual(["update", "unchanged", "unchanged"]);
    expect(updateOf(p[0]).stock?.changed).toEqual(["stockPrice"]);
    expect(countStockChanges(p)).toBe(1);
  });
});
