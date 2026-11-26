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
  it("D125, có mẫu sản phẩm khách thích: nói rõ ảnh nào là logo, ảnh nào là mẫu, nêu loại sản phẩm và công nghệ ưu tiên", () => {
    const { user } = buildPickMessages({ count: 3, materials: catalog, sample: { images: 2, productType: "  Móc   khóa ", techniques: ["Khắc laser"] } });
    expect(user).toContain("Ảnh đính kèm ĐẦU TIÊN là logo của khách. 2 ảnh tiếp theo là các MẪU SẢN PHẨM khách thích");
    expect(user).toContain("- Khách muốn làm: Móc khóa.");
    expect(user).toContain("Ưu tiên chất liệu có màu, bề mặt và cảm giác gần với (các) mẫu sản phẩm khách thích");
    expect(user).toContain("Mẫu khách thích thuộc nhóm công nghệ: Khắc laser.");
    expect(user).not.toContain("Giữ cả hai công nghệ");
    expect(user).toContain("Chọn đúng 3 chất liệu");
  });

  it("D125, một ảnh mẫu thì gọi là ảnh thứ hai; không gửi được ảnh mẫu thì chỉ còn phần chữ; board chưa gắn công nghệ thì giữ câu dặn cũ", () => {
    const one = buildPickMessages({ count: 2, materials: catalog, sample: { images: 1, productType: "Ví da", techniques: [] } }).user;
    expect(one).toContain("Ảnh thứ hai là MẪU SẢN PHẨM khách thích");
    expect(one).toContain("Giữ cả hai công nghệ");
    const none = buildPickMessages({ count: 2, materials: catalog, sample: { images: 0, productType: "Ví da", techniques: [] } }).user;
    expect(none.startsWith("Ảnh đính kèm là logo của khách.")).toBe(true);
    expect(none).toContain("- Khách muốn làm: Ví da.");
    expect(none).not.toContain("mẫu sản phẩm khách thích, nhưng");
  });

  it("không có mẫu thì câu hỏi giữ nguyên như trước (không nhắc loại sản phẩm)", () => {
    const { user } = buildPickMessages({ count: 3, materials: catalog });
    expect(user.startsWith("Ảnh đính kèm là logo của khách.")).toBe(true);
    expect(user).not.toContain("Khách muốn làm");
    expect(user).toContain("Giữ cả hai công nghệ");
  });

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

describe("parsePickResponse với câu trả lời không phải JSON chuẩn", () => {
  it("đọc được dạng gpt-5-2 trả về thật: đối tượng JavaScript bọc trong <text> và JSON.stringify, tên khóa không có nháy", () => {
    const text = `<text preserveWhitespace>{JSON.stringify({
  summary: "Logo phong cách tối giản, hiện đại; tông đỏ, đen và trắng.",
  isBadge: false,
  picks: [
    {id: 4, reason: "Xanh navy mờ tạo vẻ chuyên nghiệp."},
    {id: 2, reason: "Đen xanh than, khắc lộ nền trắng tạo tương phản rõ với logo."},
    {id: 5, reason: "Đỏ đô hợp tông chính của logo."}
  ]
})}</text>`;
    const a = parsePickResponse(text, catalog, 24);
    expect(a?.summary).toBe("Logo phong cách tối giản, hiện đại; tông đỏ, đen và trắng.");
    expect(a?.isBadge).toBe(false);
    expect(a?.picks.map((p) => p.code)).toEqual(["M4", "M2", "M5"]);
    expect(a?.picks[1].reason).toBe("Đen xanh than, khắc lộ nền trắng tạo tương phản rõ với logo.");
  });

  it("câu trả lời bị cắt giữa chừng: lấy các lựa chọn đã viết xong", () => {
    const text = '{"summary":"Logo đậm.","isBadge":true,"picks":[{"id":1,"reason":"hợp"},{"id":3,"reason":"tương phản"},{"id":5,"reas';
    const a = parsePickResponse(text, catalog, 24);
    expect(a?.isBadge).toBe(true);
    expect(a?.picks.map((p) => p.code)).toEqual(["M1", "M3", "M5"]);
    expect(a?.picks[2].reason).toBe("");
  });

  it("nháy đơn, dấu nháy thoát trong lý do, và thứ tự reason trước id", () => {
    // String.raw để dấu gạch chéo ngược tới đúng bộ đọc như trong câu trả lời thật của AI
    const text = String.raw`Kết quả: { summary: 'Logo \'cổ điển\'', picks: [ { reason: "Màu \"vàng\" sang", id: 2 }, { id: '3', reason: 'trơn, dễ đọc' } ] }`;
    const a = parsePickResponse(text, catalog, 24);
    expect(a?.summary).toBe("Logo 'cổ điển'");
    expect(a?.picks).toEqual([
      { materialId: "id2", code: "M2", name: "Chất liệu 2", reason: 'Màu "vàng" sang' },
      { materialId: "id3", code: "M3", name: "Chất liệu 3", reason: "trơn, dễ đọc" },
    ]);
  });

  it("chữ trong lý do giống tên khóa không làm hỏng việc đọc", () => {
    const text = '{summary: "Logo có id: 7 trong tên", picks: [{id: 1, reason: "hợp, reason: rõ, id: 9"}]}';
    const a = parsePickResponse(text, catalog, 24);
    expect(a?.picks.map((p) => p.code)).toEqual(["M1"]);
    expect(a?.picks[0].reason).toBe("hợp, reason: rõ, id: 9");
  });

  it("vẫn trả null khi không có lựa chọn nào đọc được", () => {
    expect(parsePickResponse("{JSON.stringify({ summary: 'x', picks: [] })}", catalog, 24)).toBeNull();
    expect(parsePickResponse("<text>Tôi không xem được ảnh</text>", catalog, 24)).toBeNull();
  });
});
