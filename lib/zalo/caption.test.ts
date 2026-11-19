import { describe, expect, it } from "vitest";
import { buildCaption, DEFAULT_CAPTION_TEMPLATE, publicSessionUrl } from "./caption";

const input = { brandName: "Đồng Xanh", customerName: "Anh Minh", label: "Ảnh 1 · Trang mẫu", saleName: "Lan", sessionUrl: "https://a.vn/sessions/x" };

describe("buildCaption", () => {
  it("mẫu mặc định cho ra đúng nội dung như trước đây", () => {
    expect(buildCaption(input)).toBe("Đồng Xanh · Anh Minh\nẢnh 1 · Trang mẫu\nSale: Lan\nhttps://a.vn/sessions/x");
    expect(DEFAULT_CAPTION_TEMPLATE).toContain("{link}");
  });

  it("bỏ dòng {link} khi chưa có địa chỉ công khai", () => {
    expect(buildCaption({ ...input, sessionUrl: undefined })).toBe("Đồng Xanh · Anh Minh\nẢnh 1 · Trang mẫu\nSale: Lan");
  });

  it("dùng mẫu tùy chỉnh, một chỗ trống có thể xuất hiện nhiều lần", () => {
    expect(buildCaption(input, "Mẫu cho {thuong_hieu}\n{thuong_hieu} - {nhan}")).toBe("Mẫu cho Đồng Xanh\nĐồng Xanh - Ảnh 1 · Trang mẫu");
  });

  it("giữ dòng chữ thường không có chỗ trống, kể cả dòng trống làm khoảng cách", () => {
    expect(buildCaption(input, "Xin chào\n\n{khach}")).toBe("Xin chào\n\nAnh Minh");
  });

  it("dòng có chỗ trống mà không có thông tin để điền thì bỏ cả dòng, kể cả chữ đứng trước", () => {
    expect(buildCaption({ ...input, sessionUrl: undefined }, "Xem: {link}\n{sale}")).toBe("Lan");
    expect(buildCaption(input, "Xem: {link}\n{sale}")).toBe("Xem: https://a.vn/sessions/x\nLan");
  });

  it("cắt ở 2000 ký tự", () => {
    expect(buildCaption({ ...input, label: "x".repeat(3000) }, "{nhan}")).toHaveLength(2000);
  });
});

describe("publicSessionUrl", () => {
  it("chỉ trả link khi là https", () => {
    expect(publicSessionUrl("https://a.vn/", "s1")).toBe("https://a.vn/sessions/s1");
    expect(publicSessionUrl("http://localhost:3000", "s1")).toBeUndefined();
  });
});
