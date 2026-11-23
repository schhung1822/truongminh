import { describe, expect, it } from "vitest";
import { authorFromCommentLabel, cleanCommentText, commentCountFromText, commentIdsFromHref, fallbackCommentId, isCheckpointUrl, isCommentLabel, isLoginUrl, isOwnComment, isUiNoise, labelMatches, linkPattern, looksLikeRelativeTime, normalizeLabel } from "./selectors";

describe("labelMatches (tiếng Việt và tiếng Anh)", () => {
  it("xem thêm bình luận", () => {
    for (const t of ["Xem thêm bình luận", "Xem thêm 3 bình luận", "Xem các bình luận trước", "View more comments", "View 3 more comments", "View previous comments"]) {
      expect(labelMatches(t, "viewMoreComments"), t).toBe(true);
    }
  });

  it("xem phản hồi", () => {
    for (const t of ["Xem phản hồi", "Xem 2 phản hồi", "Xem tất cả 5 phản hồi", "Xem thêm 3 phản hồi", "1 phản hồi", "View 1 reply", "View all 3 replies", "2 replies"]) {
      expect(labelMatches(t, "viewReplies"), t).toBe(true);
    }
  });

  it("'Xem thêm' mở nội dung bị cắt, không lẫn với xem thêm bình luận", () => {
    expect(labelMatches("Xem thêm", "seeMore")).toBe(true);
    expect(labelMatches("… Xem thêm", "seeMore")).toBe(true);
    expect(labelMatches("See more", "seeMore")).toBe(true);
    expect(labelMatches("Xem thêm bình luận", "seeMore")).toBe(false);
    expect(labelMatches("Xem thêm", "viewMoreComments")).toBe(false);
  });

  it("menu sắp xếp bình luận", () => {
    for (const t of ["Phù hợp nhất", "Most relevant", "Mới nhất", "Newest", "Tất cả bình luận", "All comments"]) {
      expect(labelMatches(t, "sortButton"), t).toBe(true);
    }
    expect(labelMatches("Tất cả bình luận", "allComments")).toBe(true);
    expect(labelMatches("All comments", "allComments")).toBe(true);
    expect(labelMatches("Phù hợp nhất", "allComments")).toBe(false);
  });

  it("không nhận nút khác (kể cả nút gửi hay trả lời)", () => {
    for (const t of ["Trả lời", "Reply", "Bình luận", "Comment", "Thích", "Chia sẻ", "Đăng", "Post", "Gửi", ""]) {
      expect(labelMatches(t, "viewMoreComments"), t).toBe(false);
      expect(labelMatches(t, "viewReplies"), t).toBe(false);
      expect(labelMatches(t, "seeMore"), t).toBe(false);
    }
  });

  it("chuẩn hoá nhãn", () => {
    expect(normalizeLabel("  …  Xem   thêm ")).toBe("xem them");
  });
});

describe("commentIdsFromHref", () => {
  it("comment gốc", () => {
    expect(commentIdsFromHref("https://www.facebook.com/groups/1/posts/2/?comment_id=123456&__cft__[0]=x")).toEqual({ fbCommentId: "123456", parentFbCommentId: null });
  });

  it("trả lời: mã là reply_comment_id, cha là comment_id", () => {
    expect(commentIdsFromHref("https://www.facebook.com/x/posts/9?comment_id=111&reply_comment_id=222")).toEqual({ fbCommentId: "222", parentFbCommentId: "111" });
  });

  it("link tương đối", () => {
    expect(commentIdsFromHref("/permalink.php?story_fbid=1&id=2&comment_id=987")).toEqual({ fbCommentId: "987", parentFbCommentId: null });
  });

  it("không có comment_id hoặc mã lạ thì null", () => {
    expect(commentIdsFromHref("https://www.facebook.com/groups/1/posts/2/")).toBeNull();
    expect(commentIdsFromHref("https://www.facebook.com/x?comment_id=a b")).toBeNull();
    expect(commentIdsFromHref("")).toBeNull();
  });
});

describe("nhận biết trang đặc biệt", () => {
  it("trang đăng nhập", () => {
    expect(isLoginUrl("https://www.facebook.com/login/?next=https%3A%2F%2Fwww.facebook.com%2F")).toBe(true);
    expect(isLoginUrl("https://www.facebook.com/login.php")).toBe(true);
    expect(isLoginUrl("https://www.facebook.com/groups/1/posts/2")).toBe(false);
    expect(isLoginUrl("https://example.com/login")).toBe(false);
  });

  it("trang xác minh / checkpoint", () => {
    expect(isCheckpointUrl("https://www.facebook.com/checkpoint/1501092823525282/?next=x")).toBe(true);
    expect(isCheckpointUrl("https://www.facebook.com/two_step_verification/authentication/")).toBe(true);
    expect(isCheckpointUrl("https://www.facebook.com/groups/1/posts/2")).toBe(false);
    expect(isCheckpointUrl("không phải url")).toBe(false);
  });
});

describe("commentCountFromText", () => {
  it("đọc số bình luận", () => {
    expect(commentCountFromText("12 bình luận")).toBe(12);
    expect(commentCountFromText("3 comments")).toBe(3);
    expect(commentCountFromText("1 comment")).toBe(1);
    expect(commentCountFromText("1,5K bình luận")).toBe(1500);
    expect(commentCountFromText("2.3K comments")).toBe(2300);
  });

  it("không có số thì null", () => {
    expect(commentCountFromText("Bình luận")).toBeNull();
    expect(commentCountFromText("2 giờ")).toBeNull();
  });
});

describe("cleanCommentText", () => {
  it("gộp khoảng trắng, bỏ dòng trống và nhãn 'Xem thêm'", () => {
    expect(cleanCommentText("Xin giá\n… Xem thêm\n\n  0912 345   678 ")).toBe("Xin giá\n0912 345 678");
    expect(cleanCommentText("   ")).toBe("");
  });
});

describe("isOwnComment", () => {
  const own = { ownProfileUrl: "https://www.facebook.com/lan.truongminh", ownDisplayName: "Lan Trường Minh" };

  it("cùng dạng link: so link", () => {
    expect(isOwnComment({ ...own, authorUrl: "https://www.facebook.com/lan.truongminh", authorName: "Ai đó" })).toBe(true);
    expect(isOwnComment({ ...own, authorUrl: "https://www.facebook.com/nguoi.khac", authorName: "Lan Trường Minh" })).toBe(false);
  });

  it("khác dạng link (id số trong nhóm vs tên đẹp): so tên hiển thị", () => {
    expect(isOwnComment({ ...own, authorUrl: "https://www.facebook.com/profile.php?id=100012345678", authorName: "lan trường minh" })).toBe(true);
    expect(isOwnComment({ ...own, authorUrl: "https://www.facebook.com/profile.php?id=100012345678", authorName: "Nguyễn Văn A" })).toBe(false);
  });

  it("không có link: so tên", () => {
    expect(isOwnComment({ ...own, authorUrl: null, authorName: "Lan Trường Minh" })).toBe(true);
    expect(isOwnComment({ ...own, authorUrl: null, authorName: "" })).toBe(false);
  });
});

describe("nhãn có dòng mô tả phụ, nhãn giao diện, thời gian tương đối", () => {
  it("menu 'Tất cả bình luận' có dòng mô tả bên dưới vẫn khớp (so dòng đầu)", () => {
    expect(labelMatches("Tất cả bình luận\nHiển thị tất cả bình luận, bao gồm cả bình luận có thể là spam.", "allComments")).toBe(true);
    expect(labelMatches("Phù hợp nhất\nHiển thị bình luận của bạn bè trước", "sortButton")).toBe(true);
    expect(labelMatches("Xem thêm bình luận\n3 trong 12", "viewMoreComments")).toBe(true);
  });

  it("các nhãn thêm: 'Xem 3 bình luận trước', 'See more comments'", () => {
    expect(labelMatches("Xem 3 bình luận trước", "viewMoreComments")).toBe(true);
    expect(labelMatches("See more comments", "viewMoreComments")).toBe(true);
  });

  it("nhận ra chữ chỉ là nhãn giao diện quanh bình luận", () => {
    for (const t of ["Thích", "Phản hồi", "Like", "Reply", "Đã chỉnh sửa", "Tác giả", "Top fan", "2 giờ", "5m", "3", "·", "Xem bản dịch"]) expect(isUiNoise(t), t).toBe(true);
    for (const t of ["ib giá em nhé", "0912 345 678", "Mình quan tâm"]) expect(isUiNoise(t), t).toBe(false);
  });

  it("thời gian tương đối", () => {
    for (const t of ["2 giờ", "5 phút", "3 ngày", "1 tuần", "2h", "5m", "3d", "1w", "Vừa xong", "Just now", "Hôm qua", "2 giờ trước", "3 days ago"]) expect(looksLikeRelativeTime(t), t).toBe(true);
    for (const t of ["Nguyễn Văn A", "0912345678", "giờ", "2 chiếc"]) expect(looksLikeRelativeTime(t), t).toBe(false);
  });
});

describe("aria-label của bình luận và mã tạm", () => {
  it("lấy tên người viết từ aria-label", () => {
    expect(authorFromCommentLabel("Bình luận của Nguyễn Văn A")).toBe("Nguyễn Văn A");
    expect(authorFromCommentLabel("Phản hồi của Trần B")).toBe("Trần B");
    expect(authorFromCommentLabel("Comment by John Doe")).toBe("John Doe");
    expect(authorFromCommentLabel("Reply by Jane")).toBe("Jane");
    expect(authorFromCommentLabel("Bài viết của Lan")).toBeNull();
    expect(authorFromCommentLabel(null)).toBeNull();
    expect(isCommentLabel("Bình luận của X")).toBe(true);
    expect(isCommentLabel("Bài viết của X")).toBe(false);
  });

  it("mã tạm ổn định, khác nhau theo nội dung, chỉ gồm ký tự server chấp nhận", () => {
    const a = fallbackCommentId("u1|ib giá");
    expect(a).toBe(fallbackCommentId("u1|ib giá"));
    expect(a).not.toBe(fallbackCommentId("u1|ib giá!"));
    expect(a).toMatch(/^h[a-z0-9]+$/);
    expect(a.length).toBeLessThan(30);
  });

  it("mẫu đường link thay số và mã dài bằng #, bỏ tham số theo dõi", () => {
    expect(linkPattern("https://www.facebook.com/groups/123456789/posts/987654321012/?comment_id=555&__cft__[0]=abc")).toBe("www.facebook.com/groups/#/posts/#/?comment_id");
    expect(linkPattern("https://www.facebook.com/profile.php?id=100012345678")).toBe("www.facebook.com/profile.php?id");
    expect(linkPattern("https://www.facebook.com/lan/posts/pfbid02AbCdEfGhIjKlMnOpQrStUvWxYz")).toBe("www.facebook.com/lan/posts/pfbid#");
  });
});
