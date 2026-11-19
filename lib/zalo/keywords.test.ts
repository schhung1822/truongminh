import { describe, expect, it } from "vitest";
import { containsKeyword, findQuickReply, parseKeywords } from "./keywords";

describe("parseKeywords", () => {
  it("tách theo dòng, dấu phẩy, chấm phẩy; bỏ dấu, bỏ trùng và rỗng", () => {
    expect(parseKeywords("Gặp nhân viên, khiếu nại;\n\nBÁO GIÁ\ngặp nhân viên")).toEqual(["gap nhan vien", "khieu nai", "bao gia"]);
  });

  it("chuỗi rỗng không có từ khóa", () => {
    expect(parseKeywords("  \n ,; ")).toEqual([]);
  });
});

describe("containsKeyword", () => {
  const kws = parseKeywords("gặp nhân viên\nbáo giá");

  it("khớp cả cụm không phân biệt hoa thường và dấu", () => {
    expect(containsKeyword("Cho em GẶP NHÂN VIÊN với", kws)).toBe(true);
    expect(containsKeyword("xin bao gia nhe", kws)).toBe(true);
  });

  it("không khớp khi chỉ trùng một phần của từ", () => {
    expect(containsKeyword("chúng tôi báo giáo viên", parseKeywords("báo giá"))).toBe(false);
    expect(containsKeyword("gặp nhân", kws)).toBe(false);
  });

  it("bỏ qua dấu câu quanh từ khóa", () => {
    expect(containsKeyword("Báo giá?!", kws)).toBe(true);
    expect(containsKeyword("(gặp nhân viên)", kws)).toBe(true);
  });

  it("không có từ khóa thì không khớp", () => {
    expect(containsKeyword("xin chào", [])).toBe(false);
  });
});

describe("findQuickReply", () => {
  const list = [
    { keywords: "địa chỉ, ở đâu", reply: "Xưởng ở số 1 đường A." },
    { keywords: "giờ làm, mấy giờ", reply: "8h-17h30." },
  ];

  it("trả về câu đầu tiên có từ khóa khớp", () => {
    expect(findQuickReply("Xưởng Ở ĐÂU vậy ạ?", list)?.reply).toBe("Xưởng ở số 1 đường A.");
    expect(findQuickReply("mấy giờ mở cửa", list)?.reply).toBe("8h-17h30.");
  });

  it("không khớp thì null", () => {
    expect(findQuickReply("cho em xem mẫu", list)).toBeNull();
  });
});
