import { describe, expect, it } from "vitest";
import { faceClause, faceWords } from "./face-words";

describe("faceWords", () => {
  it("mặt trước có chất bề mặt + họ màu + tên xưởng đặt; mặt sau chỉ họ màu + tên", () => {
    expect(faceWords({ frontColorName: "bạc gương", frontColorFamily: "bac", backColorName: "xám than mờ", backColorFamily: "xam", surfaceFinish: "guong" })).toEqual({
      front: 'mirror silver "bạc gương"',
      back: 'grey "xám than mờ"',
    });
  });

  it("mã lạ do xưởng tự thêm thì bỏ phần tiếng Anh, vẫn giữ tên", () => {
    expect(faceWords({ frontColorName: "xanh rêu", frontColorFamily: "xanh-reu", surfaceFinish: "san" })).toEqual({ front: '"xanh rêu"', back: "" });
  });

  it("không có dữ liệu thì cả hai mặt rỗng; dấu ngoặc kép trong tên bị bỏ để không phá câu", () => {
    expect(faceWords({})).toEqual({ front: "", back: "" });
    expect(faceWords({ frontColorName: 'đen "nhám"' }).front).toBe('"đen nhám"');
  });
});

describe("faceClause", () => {
  const yya019 = { frontColorName: "đen xanh than", frontColorFamily: "den", backColorName: "trắng (có vết ố)", backColorFamily: "trang", surfaceFinish: "mo" };

  it("hàng khắc: nói rõ mặt tấm là mặt trước, nét khắc là mặt sau", () => {
    expect(faceClause("ENGRAVE", yya019)).toBe('untouched face = FRONT panel: matte black "đen xanh than"; engraved marks = BACK panel: white "trắng (có vết ố)"');
  });

  it("hàng cắt: chỉ dùng mặt trước", () => {
    expect(faceClause("CUT", yya019)).toBe('material (FRONT panel only): matte black "đen xanh than"');
  });

  it("thiếu dữ liệu thì không thêm gì", () => {
    expect(faceClause("ENGRAVE", {})).toBe("");
    expect(faceClause("CUT", {})).toBe("");
    expect(faceClause("ENGRAVE", { backColorFamily: "den" })).toBe("engraved marks = BACK panel: black");
  });
});
