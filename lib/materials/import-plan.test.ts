import { describe, expect, it } from "vitest";
import { parseMaterialsCsv } from "@/lib/csv/materials";
import { planMaterialsImport, summarizePlan, type ExistingMaterial } from "./import-plan";
import { DEFAULT_OPTIONS, OPTION_TYPES, type OptionRow } from "./option-types";

const options: OptionRow[] = OPTION_TYPES.flatMap((type) => DEFAULT_OPTIONS[type].map((o, i) => ({ type, value: o.value, label: o.label, sortOrder: i, isActive: true })));

const mat = (over: Partial<ExistingMaterial> = {}): ExistingMaterial => ({
  id: "id1", code: "ZY-15", name: "ZY 15", descHuman: "", thicknessMm: 0.74, isActive: true, sortOrder: 5, groupName: "Nhựa", printTech: "Khắc laser",
  baseMaterial: "nhua", technique: "khac-laser", surfaceFinish: null, surfacePattern: null, colorCount: null, frontColorName: null, frontColorFamily: null,
  frontColorConfidence: null, backColorName: null, backColorFamily: null, backColorConfidence: null, seriesCode: null, aiVisualNote: null, photoIssue: null,
  classifyConfidence: null, needsReview: false, reviewNote: null, styleTags: [], ...over,
});

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
    const p = plan("code,name,nhóm,công nghệ in\nN1,Nhựa mới,Nhựa,In UV\nN2,,Nhựa,In UV\n", []);
    expect(p[0]).toMatchObject({ kind: "create", data: { code: "N1", name: "Nhựa mới", baseMaterial: "nhua", groupName: "Nhựa", technique: "in-uv", printTech: "In UV", sortOrder: 100 } });
    expect(p[1]).toMatchObject({ kind: "error" });
  });

  it("thêm mới mà chưa chọn được nhóm/công nghệ in thì đánh dấu cần xem lại", () => {
    const p = plan("code,name\nN1,Mới\n", []);
    expect(p[0]).toMatchObject({ kind: "create", data: { groupName: "Chưa phân nhóm", printTech: "Chưa rõ", needsReview: true } });
  });

  it("thêm mới không có cột mô tả thì mô tả là chuỗi rỗng (cột bắt buộc ở CSDL)", () => {
    const p = plan("code,name,baseMaterial,technique\nN1,Mới,nhua,in-uv\n", []);
    expect(p[0]).toMatchObject({ kind: "create", data: { descHuman: "" } });
  });

  it("nhóm ghi chữ không có trong danh mục thì báo lỗi, không tự tạo nhóm", () => {
    const p = plan("code,name,nhóm,công nghệ in\nN1,Mới,Kim loại,In UV\n", []);
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
