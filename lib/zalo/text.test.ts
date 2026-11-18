import { describe, expect, it } from "vitest";
import { prepareReply, preview, splitMessage, stripMarkdown } from "./text";

describe("stripMarkdown", () => {
  it("bỏ chữ đậm, nghiêng, gạch ngang, code dòng", () => {
    expect(stripMarkdown("Giá **85.000đ** nhé, *rất* đẹp ~~cũ~~ `A1`")).toBe("Giá 85.000đ nhé, rất đẹp cũ A1");
  });

  it("đổi gạch đầu dòng thành • và bỏ tiêu đề", () => {
    expect(stripMarkdown("## Chất liệu\n- Mica\n* Gỗ\n+ Da")).toBe("Chất liệu\n• Mica\n• Gỗ\n• Da");
  });

  it("liên kết giữ lại địa chỉ, ảnh giữ chữ thay thế", () => {
    expect(stripMarkdown("Xem [bảng giá](https://a.vn/gia) ![logo](https://a.vn/x.png)")).toBe("Xem bảng giá (https://a.vn/gia) logo");
  });

  it("khối code giữ ruột, bỏ dòng trống thừa", () => {
    expect(stripMarkdown("```\ndòng 1\n```\n\n\n\nxong")).toBe("dòng 1\n\nxong");
  });

  it("không đụng dấu * trong phép nhân", () => {
    expect(stripMarkdown("10 * 5 = 50")).toBe("10 * 5 = 50");
  });
});

describe("splitMessage", () => {
  it("tin ngắn giữ nguyên, tin rỗng thì không có đoạn nào", () => {
    expect(splitMessage("xin chào")).toEqual(["xin chào"]);
    expect(splitMessage("   ")).toEqual([]);
  });

  it("không đoạn nào quá giới hạn và ghép lại đủ chữ", () => {
    const text = Array.from({ length: 60 }, (_, i) => `Dòng số ${i} có nội dung khá dài để thử cắt tin nhắn`).join("\n");
    const parts = splitMessage(text, 500);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(500);
    expect(parts.join("\n").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));
  });

  it("ưu tiên cắt ở dòng trống", () => {
    const a = "a".repeat(300);
    const b = "b".repeat(300);
    expect(splitMessage(`${a}\n\n${b}`, 400)).toEqual([a, b]);
  });

  it("chuỗi không có khoảng trắng thì cắt cứng", () => {
    const parts = splitMessage("x".repeat(1050), 500);
    expect(parts.map((p) => p.length)).toEqual([500, 500, 50]);
  });
});

describe("prepareReply và preview", () => {
  it("bỏ Markdown rồi mới cắt", () => {
    expect(prepareReply("**Chào** anh")).toEqual(["Chào anh"]);
  });
  it("preview gọn một dòng", () => {
    expect(preview("a\n\nb   c")).toBe("a b c");
    expect(preview("x".repeat(200), 10)).toHaveLength(10);
    expect(preview(null)).toBe("");
  });
});
