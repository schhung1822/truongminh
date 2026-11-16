import { describe, expect, it } from "vitest";
import { parseCsv, parseMaterialsCsv } from "./materials";

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
  it("nhận tiêu đề tiếng Việt có dấu", () => {
    const r = parseMaterialsCsv("Mã,Tên gọi,Nhóm,Công nghệ in,Mô tả\nV01,Vải bố,Vải,In UV,Dày dặn\n");
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { line: 2, code: "V01", name: "Vải bố", groupName: "Vải", printTech: "In UV", descHuman: "Dày dặn" },
    ]);
  });

  it("nhận tiêu đề tiếng Anh, cột thiếu thì để trống", () => {
    const r = parseMaterialsCsv("code,name\nP1,Mica\n");
    expect(r.rows[0]).toMatchObject({ code: "P1", name: "Mica", groupName: "", printTech: "" });
  });

  it("báo lỗi dòng thiếu mã/tên và mã bị lặp, vẫn đọc các dòng tốt", () => {
    const r = parseMaterialsCsv("mã,tên\nA,Một\n,Hai\nB,\nA,Lặp\nC,Ba\n");
    expect(r.rows.map((x) => x.code)).toEqual(["A", "C"]);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5]);
  });

  it("báo lỗi khi thiếu cột bắt buộc", () => {
    const r = parseMaterialsCsv("nhom,mota\nVải,x\n");
    expect(r.rows).toEqual([]);
    expect(r.errors[0].message).toMatch(/mã/);
  });
});
