import { describe, expect, it } from "vitest";
import { classifyPersonalContent, personalChatId, personalMessageId } from "./classify";

describe("classifyPersonalContent", () => {
  it("tin chữ giữ nguyên nội dung", () => {
    expect(classifyPersonalContent("webchat", "Xin chào")).toEqual({ kind: "TEXT", text: "Xin chào", mediaUrl: null });
  });

  it("tin ảnh: lấy chú thích và đường dẫn https; đường dẫn không phải https bị bỏ", () => {
    const ok = classifyPersonalContent("chat.photo", { title: "Logo mới", href: "https://f.zalo/abc.jpg" });
    expect(ok).toEqual({ kind: "IMAGE", text: "Logo mới", mediaUrl: "https://f.zalo/abc.jpg" });
    const bad = classifyPersonalContent("chat.photo", { href: "http://x/y.jpg" });
    expect(bad.mediaUrl).toBeNull();
    expect(bad.kind).toBe("IMAGE");
  });

  it("sticker, tin thoại, video, file có nhãn riêng", () => {
    expect(classifyPersonalContent("chat.sticker", {}).text).toBe("[Sticker]");
    expect(classifyPersonalContent("chat.voice", { href: "https://x" }).kind).toBe("VOICE");
    expect(classifyPersonalContent("chat.video.msg", {}).text).toBe("[Video]");
    expect(classifyPersonalContent("share.file", { title: "bao-gia.pdf" })).toMatchObject({ kind: "FILE", text: "[File: bao-gia.pdf]" });
    expect(classifyPersonalContent("share.file", {}).text).toBe("[File]");
  });

  it("liên kết: gộp tiêu đề, mô tả, đường dẫn không lặp; không có gì thì báo chưa hiển thị được", () => {
    const link = classifyPersonalContent("chat.recommended", { title: "Trang A", description: "Mô tả", href: "https://a.vn" });
    expect(link.text).toBe("Trang A\nMô tả\nhttps://a.vn");
    expect(classifyPersonalContent("chat.recommended", { title: "x", href: "x" }).text).toBe("x");
    expect(classifyPersonalContent("lạ", {})).toMatchObject({ kind: "OTHER" });
    expect(classifyPersonalContent("lạ", null)).toMatchObject({ kind: "OTHER" });
  });
});

describe("mã lưu trong CSDL", () => {
  it("có tiền tố p: nên không trùng mã của bot", () => {
    expect(personalChatId("acc1", "123")).toBe("p:acc1:123");
    expect(personalMessageId("acc1", "999")).toBe("p:acc1:999");
  });
});
