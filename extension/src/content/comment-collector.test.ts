import { describe, expect, it } from "vitest";
import type { ReadComment } from "./extract";
import { CommentCollector } from "./comment-collector";

const comment = (id: string, text: string, extra: Partial<ReadComment> = {}): ReadComment => ({
  fb_comment_id: id,
  parent_fb_comment_id: null,
  author_name: "Khách A",
  author_profile_url: "https://www.facebook.com/khach.a",
  is_own: false,
  text,
  time_text: "2 giờ",
  fallbackId: false,
  ...extra,
});

describe("CommentCollector", () => {
  it("giữ comment của các lát DOM khác nhau khi Facebook virtualize danh sách", () => {
    const collector = new CommentCollector();
    collector.addAll([comment("1", "một"), comment("2", "hai")]);
    collector.addAll([comment("3", "ba"), comment("4", "bốn")]);
    expect(collector.values().map((c) => c.fb_comment_id)).toEqual(["1", "2", "3", "4"]);
  });

  it("cập nhật cùng mã bằng nội dung đầy đủ hơn", () => {
    const collector = new CommentCollector();
    collector.addAll([comment("1", "Nội dung bị cắt")]);
    collector.addAll([comment("1", "Nội dung bị cắt và phần còn lại")]);
    expect(collector.values()).toHaveLength(1);
    expect(collector.values()[0].text).toBe("Nội dung bị cắt và phần còn lại");
  });

  it("gộp mã tạm trước và sau khi bấm Xem thêm", () => {
    const collector = new CommentCollector();
    collector.addAll([comment("hngan", "Tôi cần báo", { fallbackId: true })]);
    collector.addAll([comment("hdai", "Tôi cần báo giá 0912345678", { fallbackId: true })], { mergeExpandedFallbacks: true });
    expect(collector.values()).toHaveLength(1);
    expect(collector.values()[0]).toMatchObject({ fb_comment_id: "hdai", text: "Tôi cần báo giá 0912345678" });
  });

  it("không tự gộp hai mã tạm chỉ vì cùng tác giả và nội dung giống tiền tố", () => {
    const collector = new CommentCollector();
    collector.addAll([comment("h1", "Tôi cần báo", { fallbackId: true }), comment("h2", "Tôi cần báo giá", { fallbackId: true })]);
    expect(collector.values()).toHaveLength(2);
  });
});
