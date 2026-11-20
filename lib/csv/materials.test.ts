import { describe, expect, it } from "vitest";
import { MATERIAL_CSV_COLUMNS, parseCsv, parseMaterialsCsv } from "./materials";

describe("parseCsv", () => {
  it("đọc ô có dấu phẩy và ngoặc kép bên trong", () => {
    const rows = parseCsv('a,b\n"x, y","nói ""hay"""\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'nói "hay"'],
    ]);
  });

  it("tự nhận dấu chấm phẩy (Excel Việt Nam) và bỏ BOM", () => {
    const rows = parseCsv("﻿ma;ten\nA1;Vải bố\n");
    expect(rows).toEqual([
      ["ma", "ten"],
      ["A1", "Vải bố"],
    ]);
  });

  it("hỗ trợ xuống dòng kiểu Windows và bỏ dòng trống", () => {
    expect(parseCsv("a,b\r\n1,2\r\n\r\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

describe("parseMaterialsCsv", () => {
  it("nhận tiêu đề tiếng Việt có dấu (file cũ)", () => {
    const r = parseMaterialsCsv("Mã,Tên gọi,Nhóm,Công nghệ in,Mô tả\nV01,Vải bố,Vải,In UV,Dày dặn\n");
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([{ line: 2, values: { code: "V01", name: "Vải bố", groupName: "Vải", printTech: "In UV", descHuman: "Dày dặn" } }]);
  });

  it("cột thiếu thì không có trong values (giữ nguyên), ô trống cũng vậy", () => {
    const r = parseMaterialsCsv("code,name,descHuman\nP1,Mica,\n");
    expect(r.rows[0].values).toEqual({ code: "P1", name: "Mica" });
    expect(r.columns).toEqual(["code", "name", "descHuman"]);
  });

  it("[xoa] nghĩa là xóa (null), không phân biệt hoa thường", () => {
    const r = parseMaterialsCsv("code,descHuman,surfaceFinish\nP1,[XOA],[xoa]\n");
    expect(r.rows[0].values).toEqual({ code: "P1", descHuman: null, surfaceFinish: null });
  });

  it("nhận tên cột mới theo cả hai kiểu viết, cột confidence và id", () => {
    const r = parseMaterialsCsv("id,code,Front Color Family,style_tags,confidence\nabc,P1,den,a|b,CAO\n");
    expect(r.rows[0].values).toEqual({ id: "abc", code: "P1", frontColorFamily: "den", styleTags: "a|b", confidence: "CAO" });
  });

  it("dòng chỉ có id (không có mã) vẫn hợp lệ", () => {
    const r = parseMaterialsCsv("id,code,name\nabc,,Mới\n");
    expect(r.errors).toEqual([]);
    expect(r.rows[0].values).toEqual({ id: "abc", name: "Mới" });
  });

  it("báo lỗi dòng thiếu cả id lẫn mã và dòng lặp, vẫn đọc các dòng tốt", () => {
    const r = parseMaterialsCsv("mã,tên\nA,Một\n,Hai\nA,Lặp\nC,Ba\n");
    expect(r.rows.map((x) => x.values.code)).toEqual(["A", "C"]);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
  });

  it("báo lỗi khi thiếu cả cột mã lẫn id", () => {
    const r = parseMaterialsCsv("nhom,mota\nVải,x\n");
    expect(r.rows).toEqual([]);
    expect(r.errors[0].message).toMatch(/mã/);
  });

  it("file có đủ các cột xuất ra thì đọc lại đủ cột", () => {
    const header = MATERIAL_CSV_COLUMNS.join(",");
    const r = parseMaterialsCsv(`${header}\n${MATERIAL_CSV_COLUMNS.map((c) => (c === "code" ? "X1" : "v")).join(",")}\n`);
    expect(r.columns).toHaveLength(MATERIAL_CSV_COLUMNS.length);
  });
});

describe("parseMaterialsCsv: thông số tấm (mm, đồng)", () => {
  const STOCK = ["stockWidthMm", "stockHeightMm", "stockPrice", "edgeMarginMm", "gapMm", "allowRotate"] as const;

  it("danh sách cột có đủ 6 cột tấm, đặt tên theo đơn vị lưu trữ", () => {
    for (const c of STOCK) expect(MATERIAL_CSV_COLUMNS).toContain(c);
  });

  it("đọc 6 cột theo tên chuẩn", () => {
    const r = parseMaterialsCsv("code,stockWidthMm,stockHeightMm,stockPrice,edgeMarginMm,gapMm,allowRotate\nP1,600,400,1500000,5,3,FALSE\n");
    expect(r.errors).toEqual([]);
    expect(r.rows[0].values).toEqual({ code: "P1", stockWidthMm: "600", stockHeightMm: "400", stockPrice: "1500000", edgeMarginMm: "5", gapMm: "3", allowRotate: "FALSE" });
    expect(r.columns).toEqual(expect.arrayContaining([...STOCK]));
  });

  it("nhận tiêu đề tiếng Việt có dấu ghi rõ đơn vị và kiểu viết gạch dưới", () => {
    const r = parseMaterialsCsv("Mã,Rộng tấm (mm),Cao tấm (mm),Giá một tấm,Lề tấm (mm),Khoảng cách (mm),Cho phép xoay\nP1,600,400,1500000,5,3,TRUE\n");
    expect(r.rows[0].values).toEqual({ code: "P1", stockWidthMm: "600", stockHeightMm: "400", stockPrice: "1500000", edgeMarginMm: "5", gapMm: "3", allowRotate: "TRUE" });
    const s = parseMaterialsCsv("code,stock_width_mm,stock_height_mm,edge_margin_mm,gap_mm,allow_rotate\nP1,600,400,5,3,TRUE\n");
    expect(s.rows[0].values).toMatchObject({ stockWidthMm: "600", stockHeightMm: "400", edgeMarginMm: "5", gapMm: "3", allowRotate: "TRUE" });
  });

  it("ô trống = giữ nguyên (không có trong values), [xoa] = xóa (null)", () => {
    const r = parseMaterialsCsv("code,stockWidthMm,stockPrice,gapMm,allowRotate\nP1,,1500000,[XOA],\n");
    expect(r.rows[0].values).toEqual({ code: "P1", stockPrice: "1500000", gapMm: null });
    expect("stockWidthMm" in r.rows[0].values).toBe(false);
    expect("allowRotate" in r.rows[0].values).toBe(false);
  });

  it("file cũ không có cột tấm: không có cột nào của tấm trong kết quả", () => {
    const r = parseMaterialsCsv("Mã,Tên gọi,Nhóm,Công nghệ in,Mô tả\nV01,Vải bố,Vải,In UV,Dày dặn\n");
    expect(r.errors).toEqual([]);
    for (const c of STOCK) {
      expect(r.columns).not.toContain(c);
      expect(c in r.rows[0].values).toBe(false);
    }
  });
});
