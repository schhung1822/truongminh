import { describe, expect, it } from "vitest";
import { buildSupplierMessages, parseSupplierResponse, SUPPLIER_AI_MARKER } from "./supplier-ai";

const input = {
  postContent: "Cần tìm xưởng may áo polo mẫu P01, số lượng 500 cái",
  productRef: "Áo polo mẫu P01",
  comment: "Xưởng em may áo thun, áo polo, nhận từ 200 cái. LH [số điện thoại]",
  pageName: "Vật Liệu Logo ABC",
  materials: [
    { name: "Vân xoắn bạc xám", kind: "Nhựa, Khắc laser", desc: "Mặt trước bạc xám với hoa văn xoắn ốc" },
    { name: "Navy xám than", kind: "Nhựa, Khắc laser", desc: "" },
  ],
  usedDrafts: ["Dạ chào anh, bên em là Vật Liệu Logo ABC..."],
};

describe("buildSupplierMessages", () => {
  const { system, user } = buildSupplierMessages(input);

  it("có dấu hiệu để bản chat giả nhận ra, và yêu cầu chỉ trả JSON", () => {
    expect(system).toContain(SUPPLIER_AI_MARKER);
    expect(user).toContain('"supplier_type"');
    expect(user).toContain('"should_reply"');
  });
  it("đưa đủ bài, sản phẩm, comment và vật liệu gợi ý (tên + mô tả ngắn)", () => {
    expect(user).toContain("Cần tìm xưởng may áo polo mẫu P01");
    expect(user).toContain("SẢN PHẨM CỦA BÀI: Áo polo mẫu P01");
    expect(user).toContain("Xưởng em may áo thun");
    expect(user).toContain("1. Vân xoắn bạc xám | Nhựa, Khắc laser | Mặt trước bạc xám");
    expect(user).toContain("2. Navy xám than | Nhựa, Khắc laser");
  });
  it("nêu các quy tắc của câu trả lời: 1-2 câu, có tên fanpage, là bên cung cấp vật liệu, 1-2 vật liệu, không nhắc số, không lặp", () => {
    expect(user).toMatch(/1 đến 2 câu/);
    expect(user).toContain('Có tên "Vật Liệu Logo ABC"');
    expect(user).toMatch(/bên cung cấp vật liệu/);
    expect(user).toMatch(/Không đóng vai người ngoài hay khách hàng/);
    expect(user).toMatch(/Nhắc đúng 1 hoặc 2 vật liệu/);
    expect(user).toMatch(/Không nhắc lại số điện thoại/);
    expect(user).toContain("Dạ chào anh, bên em là Vật Liệu Logo ABC...");
  });
  it("bài chưa chọn vật liệu thì dặn không bịa tên vật liệu", () => {
    const u = buildSupplierMessages({ ...input, materials: [] }).user;
    expect(u).toMatch(/bài chưa chọn vật liệu nào/);
    expect(u).toMatch(/Không bịa tên vật liệu/);
  });
});

describe("parseSupplierResponse", () => {
  it("đọc JSON đúng dạng", () => {
    expect(parseSupplierResponse('{"supplier_type":"manufacturer","capability":"Xưởng may áo thun, áo polo, nhận đơn từ 200 cái","should_reply":true,"draft":"Dạ chào anh..."}')).toEqual({
      supplierType: "MANUFACTURER",
      capability: "Xưởng may áo thun, áo polo, nhận đơn từ 200 cái",
      shouldReply: true,
      draft: "Dạ chào anh...",
    });
  });
  it("đọc được JSON bọc trong khối mã hoặc có chữ trước sau", () => {
    const r = parseSupplierResponse('Đây là kết quả:\n```json\n{"supplier_type":"Broker","capability":"","should_reply":false,"draft":""}\n```');
    expect(r).toEqual({ supplierType: "BROKER", capability: "", shouldReply: false, draft: "" });
  });
  it("thiếu should_reply thì coi là nên trả lời; thiếu draft thì để rỗng", () => {
    expect(parseSupplierResponse('{"supplier_type":"unknown"}')).toEqual({ supplierType: "UNKNOWN", capability: "", shouldReply: true, draft: "" });
  });
  it("sai dạng hoặc loại lạ thì null (nơi gọi giữ câu mẫu, loại chưa rõ)", () => {
    expect(parseSupplierResponse("Xin lỗi, tôi không làm được")).toBeNull();
    expect(parseSupplierResponse('{"supplier_type":"factory"}')).toBeNull();
    expect(parseSupplierResponse('{"supplier_type": manufacturer}')).toBeNull();
  });
});
