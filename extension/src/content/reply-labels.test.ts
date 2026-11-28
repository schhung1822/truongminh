import { describe, expect, it } from "vitest";
import { isSendLabel, labelHasName, labelMatches, maskLabel, replyLabelMatches, sameName } from "./selectors";

describe("nhãn của luồng trả lời", () => {
  it("nút Phản hồi dưới bình luận (Việt và Anh)", () => {
    for (const t of ["Phản hồi", "Trả lời", "Reply", "  phản hồi  "]) expect(replyLabelMatches(t, "replyAction"), t).toBe(true);
    for (const t of ["Xem 2 phản hồi", "2 phản hồi", "Phản hồi của Lan", "Thích", "Bình luận", "Gửi", ""]) expect(replyLabelMatches(t, "replyAction"), t).toBe(false);
  });

  it("identity_switcher: các nhãn của nút chọn bình luận với tư cách ai", () => {
    for (const t of [
      "Voice Selector",
      "Bộ chọn giọng nói",
      "Bình luận với tư cách Lan Trường Minh",
      "Đang tương tác với tư cách Vật Liệu ABC",
      "Thích và bình luận dưới tên Vật Liệu ABC",
      "Chọn danh tính bình luận",
      "Interacting as Lan",
      "Comment as Lan",
      "Commenting as Vật Liệu ABC",
      "Like and comment as your Page",
      "Switch identity",
    ]) {
      expect(replyLabelMatches(t, "identitySwitcher"), t).toBe(true);
    }
    for (const t of ["Phản hồi", "Bình luận", "Thích", "Phù hợp nhất", "Hành động với bài viết này", "Chèn biểu tượng cảm xúc", "Gửi", ""]) {
      expect(replyLabelMatches(t, "identitySwitcher"), t).toBe(false);
    }
  });

  it("nhãn nút gửi / đăng: không bao giờ được bấm", () => {
    for (const t of ["Gửi", "gửi", "Send", "Đăng", "Post", "Đăng bài", "Bình luận", "Comment", "Lưu", "Cập nhật", "Chia sẻ", "Share now"]) expect(isSendLabel(t), t).toBe(true);
    for (const t of ["Phản hồi", "Reply", "Xem thêm bình luận", "Vật Liệu Logo ABC", "Chọn danh tính bình luận", "Thích", ""]) expect(isSendLabel(t), t).toBe(false);
  });

  it("các nhãn đọc / mở rộng của lần quét không lẫn với nhãn của luồng trả lời", () => {
    for (const t of ["Phản hồi", "Reply", "Gửi", "Chọn danh tính bình luận"]) {
      expect(labelMatches(t, "viewReplies"), t).toBe(false);
      expect(labelMatches(t, "viewMoreComments"), t).toBe(false);
      expect(labelMatches(t, "seeMore"), t).toBe(false);
    }
  });
});

describe("so tên danh tính", () => {
  it("sameName: bỏ dấu, hoa thường, khoảng trắng thừa", () => {
    expect(sameName("Vật Liệu  Logo ABC", "vật liệu logo abc")).toBe(true);
    expect(sameName("Vat Lieu Logo ABC", "Vật Liệu Logo ABC")).toBe(true);
    expect(sameName("Vật Liệu Logo ABC", "Vật Liệu Logo ABC Hà Nội")).toBe(false);
    expect(sameName("", "")).toBe(false);
    expect(sameName(null, "Lan")).toBe(false);
  });

  it("labelHasName: tên phải đứng nguyên từ trong nhãn", () => {
    expect(labelHasName("Bình luận dưới tên Vật Liệu Logo ABC", "Vật Liệu Logo ABC")).toBe(true);
    expect(labelHasName("Comment as Lan Trường Minh…", "Lan Trường Minh")).toBe(true);
    expect(labelHasName("Bình luận dưới tên Lana", "Lan")).toBe(false);
    expect(labelHasName("Bình luận dưới tên Lan", "")).toBe(false);
    expect(labelHasName(null, "Lan")).toBe(false);
  });
});

describe("maskLabel: che tên trước khi đưa nhãn vào báo cáo chẩn đoán", () => {
  const known = { nick: "Lan Trường Minh", pages: ["Vật Liệu Logo ABC"] };

  it("tên nick và tên fanpage đã biết thành {nick} / {page}", () => {
    expect(maskLabel("Bình luận dưới tên Lan Trường Minh", known)).toBe("Bình luận dưới tên {nick}");
    expect(maskLabel("Phản hồi dưới tên Vật Liệu Logo ABC", known)).toBe("Phản hồi dưới tên {page}");
    expect(maskLabel("Commenting as Vật Liệu Logo ABC", known)).toBe("Commenting as {page}");
  });

  it("tên người khác đứng sau các cụm 'dưới tên', 'trả lời', 'của'... bị che", () => {
    expect(maskLabel("Bình luận dưới tên Nguyễn Văn A", known)).toBe("Bình luận dưới tên {…}");
    expect(maskLabel("Trả lời Nguyễn Văn A", known)).toBe("Trả lời {…}");
    expect(maskLabel("Phản hồi Trần Thị B...", known)).toBe("Phản hồi {…}");
    expect(maskLabel("Hành động với bài viết của Nguyễn Văn A", known)).toBe("Hành động với bài viết của {…}");
    expect(maskLabel("Reply to John Doe", known)).toBe("Reply to {…}");
  });

  it("nhãn không có tên thì giữ nguyên; nhãn dài bị cắt", () => {
    expect(maskLabel("Chọn danh tính bình luận", known)).toBe("Chọn danh tính bình luận");
    expect(maskLabel("x".repeat(500), known).length).toBeLessThanOrEqual(120);
  });
});
