import { describe, expect, it } from "vitest";
import { buildPickMessages, catalogLine, MATERIAL_PICK_MARKER, parsePickResponse, type CatalogMaterial } from "./suggest";

const mat = (n: number, over: Partial<CatalogMaterial> = {}): CatalogMaterial => ({
  id: `id${n}`,
  code: `M${n}`,
  name: `Chất liệu ${n}`,
  group: "Nhựa",
  technique: "Khắc laser",
  finish: "Mờ",
  pattern: "Trơn",
  frontColor: "đen / Đen",
  backColor: "trắng / Trắng",
  thickness: "Cao thành 0.6 mm",
  styles: ["Tối giản"],
  desc: "Mặt trước đen mờ.",
  ...over,
});
const catalog = [1, 2, 3, 4, 5].map((n) => mat(n));

describe("catalogLine", () => {
  it("một dòng đủ số thứ tự, mã, nhóm, công nghệ, bề mặt, màu hai mặt, độ dày, phong cách, mô tả", () => {
    expect(catalogLine(mat(1), 7)).toBe(
      "7. [M1] Chất liệu 1 | Nhựa, Khắc laser | bề mặt Mờ, họa tiết Trơn | màu đen / Đen, mặt sau trắng / Trắng | dày Cao thành 0.6 mm | hợp: Tối giản | Mặt trước đen mờ.",
    );
  });

  it("hai mặt cùng màu thì không nhắc mặt sau; thiếu nhãn nào thì bỏ phần đó; mô tả dài bị cắt", () => {
    const line = catalogLine(mat(2, { backColor: "đen / Đen", pattern: "", styles: [], thickness: "", desc: "x".repeat(400) }), 1);
    expect(line).not.toContain("mặt sau");
    expect(line).not.toContain("họa tiết");
    expect(line).not.toContain("hợp:");
    expect(line).not.toContain("dày ");
    expect(line.length).toBeLessThan(260);
  });
});

describe("buildPickMessages", () => {
  it("câu system có dấu nhận diện, câu hỏi nêu đúng số cần chọn và liệt kê đủ danh mục theo số thứ tự", () => {
    const { system, user } = buildPickMessages({ count: 3, materials: catalog });
    expect(system.startsWith(MATERIAL_PICK_MARKER)).toBe(true);
    expect(user).toContain("Chọn đúng 3 chất liệu");
    expect(user).toContain("DANH SÁCH CHẤT LIỆU (5 dòng):");
    expect(user.split("\n").filter((l) => /^\d+\. \[/.test(l))).toHaveLength(5);
    expect(user).toContain('"isBadge":true hoặc false');
  });

  it("danh mục ít hơn số cần chọn thì chỉ yêu cầu bằng số chất liệu đang có", () => {
    expect(buildPickMessages({ count: 24, materials: catalog }).user).toContain("Chọn đúng 5 chất liệu");
  });
});

describe("parsePickResponse", () => {
  it("đọc JSON bọc trong <escape> hoặc ```json, giữ đúng thứ tự AI xếp", () => {
    const text = '<escape>{"summary":"Logo thể thao.","isBadge":true,"picks":[{"id":3,"reason":"hợp tông đen"},{"id":1,"reason":"tương phản"}]}</escape>';
    const a = parsePickResponse(text, catalog, 24);
    expect(a).toEqual({
      summary: "Logo thể thao.",
      isBadge: true,
      picks: [
        { materialId: "id3", code: "M3", name: "Chất liệu 3", reason: "hợp tông đen" },
        { materialId: "id1", code: "M1", name: "Chất liệu 1", reason: "tương phản" },
      ],
    });
    expect(parsePickResponse('```json\n{"picks":[{"id":"2","reason":"ok"}]}\n```', catalog, 24)?.picks[0].code).toBe("M2");
  });

  it("bỏ số thứ tự lạ, trùng hoặc sai kiểu; cắt còn đúng số lượng yêu cầu", () => {
    const text = JSON.stringify({ isBadge: "true", picks: [{ id: 9 }, { id: 2 }, { id: 2 }, { id: 0 }, { id: "x" }, null, { id: 4 }, { id: 5 }] });
    const a = parsePickResponse(text, catalog, 2);
    expect(a?.picks.map((p) => p.code)).toEqual(["M2", "M4"]);
    expect(a?.isBadge).toBe(false); // chỉ đúng true mới tính là huy hiệu
    expect(a?.summary).toBe("");
  });

  it("không đọc được JSON hoặc không có lựa chọn hợp lệ nào thì trả null (không tự tạo ảnh)", () => {
    expect(parsePickResponse("Xin lỗi, tôi không xem được ảnh.", catalog, 24)).toBeNull();
    expect(parsePickResponse('{"summary":"x","picks":[]}', catalog, 24)).toBeNull();
    expect(parsePickResponse('{"summary":"x","picks":[{"id":99}]}', catalog, 24)).toBeNull();
    expect(parsePickResponse('{"summary":"x"}', catalog, 24)).toBeNull();
  });
});
