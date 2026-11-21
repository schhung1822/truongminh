// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.facebook.com/groups/123456789/posts/987654321012/"}
import { beforeEach, describe, expect, it } from "vitest";
import { commentArticles, findClickable, mainPostArticle, readAllComments, readPostInfo, seeMoreButtons } from "./extract";

/**
 * Kiểm tra logic đọc trang trên một trang HTML MÔ PHỎNG cấu trúc Facebook (article lồng nhau, link thời gian có comment_id,
 * nút "Xem thêm bình luận"...). Đây là giả định của người viết, KHÔNG phải trang Facebook thật: test chỉ chứng minh logic nhất quán
 * với giả định đó. Phải chạy thử trên bài thật (xem README mục "Chưa kiểm chứng").
 */
const FIXTURE = `
<div role="article" aria-label="Bài viết của Lan Trường Minh">
  <h3><a href="https://www.facebook.com/groups/123456789/user/100012345678/?__cft__[0]=x"><span>Lan Trường Minh</span></a></h3>
  <div data-ad-comet-preview="message"><div dir="auto">Cần in logo 500 cái, ib em nhé</div></div>
  <span>3 bình luận</span>
  <div role="button" id="sort">Phù hợp nhất</div>

  <div role="article" aria-label="Bình luận của Nguyễn Văn A">
    <a role="link" href="https://www.facebook.com/groups/123456789/user/200000001/"><span>Nguyễn Văn A</span></a>
    <div dir="auto"><div dir="auto">ib giá em nhé 0912.345.678</div></div>
    <a href="https://www.facebook.com/groups/123456789/posts/987654321012/?comment_id=555&amp;__cft__[0]=y">2 giờ</a>
    <div role="article" aria-label="Phản hồi của Lan Trường Minh">
      <a role="link" href="https://www.facebook.com/groups/123456789/user/100012345678/"><span>Lan Trường Minh</span></a>
      <div dir="auto">Dạ em đã nhắn, liên hệ 0987654321 nhé</div>
      <a href="https://www.facebook.com/groups/123456789/posts/987654321012/?comment_id=555&amp;reply_comment_id=556">1 giờ</a>
    </div>
  </div>

  <div role="article" aria-label="Bình luận của Trần Thị B">
    <a role="link" href="https://www.facebook.com/tran.thi.b"><span>Trần Thị B</span></a>
    <div dir="auto">Mình quan tâm <a href="https://example.com/x">link</a> bạn tư vấn giúp
      <div role="button">… Xem thêm</div></div>
    <a href="https://www.facebook.com/groups/123456789/posts/987654321012/?comment_id=777">5 phút</a>
  </div>

  <div role="button" id="more">Xem thêm 2 bình luận</div>
  <div role="button" id="send">Gửi</div>
</div>`;

const OWN = { profileUrl: "https://www.facebook.com/lan.truongminh", displayName: "Lan Trường Minh" };

beforeEach(() => {
  document.body.innerHTML = FIXTURE;
  // jsdom không có bố cục nên mọi phần tử có kích thước 0: giả lập "đang hiện" để hàm tìm nút hoạt động
  Element.prototype.getBoundingClientRect = () => ({ width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
});

describe("đọc comment", () => {
  it("chỉ lấy article có link thời gian riêng, không lấy bài chính", () => {
    expect(commentArticles()).toHaveLength(3);
    expect(mainPostArticle()?.getAttribute("aria-label")).toContain("Bài viết");
  });

  it("đọc đủ 3 comment, đúng mã, mã cha, tên, link, thời gian", () => {
    const all = readAllComments(OWN);
    expect(all.map((c) => c.fb_comment_id).sort()).toEqual(["555", "556", "777"]);
    const a = all.find((c) => c.fb_comment_id === "555")!;
    expect(a).toMatchObject({
      parent_fb_comment_id: null,
      author_name: "Nguyễn Văn A",
      author_profile_url: "https://www.facebook.com/profile.php?id=200000001",
      text: "ib giá em nhé 0912.345.678",
      time_text: "2 giờ",
      is_own: false,
    });
    const reply = all.find((c) => c.fb_comment_id === "556")!;
    expect(reply.parent_fb_comment_id).toBe("555");
    expect(reply.text).toBe("Dạ em đã nhắn, liên hệ 0987654321 nhé");
  });

  it("nhận ra comment của chính nick qua tên hiển thị khi link trong nhóm dùng id số", () => {
    const all = readAllComments(OWN);
    expect(all.find((c) => c.fb_comment_id === "556")!.is_own).toBe(true);
    expect(all.find((c) => c.fb_comment_id === "555")!.is_own).toBe(false);
    expect(all.find((c) => c.fb_comment_id === "777")!.is_own).toBe(false);
  });

  it("nhận ra comment của mình qua link khi nick dùng link id số", () => {
    const all = readAllComments({ profileUrl: "https://www.facebook.com/profile.php?id=100012345678", displayName: "Tên khác hẳn" });
    expect(all.find((c) => c.fb_comment_id === "556")!.is_own).toBe(true);
  });

  it("bỏ nhãn 'Xem thêm' và giữ chữ của comment có link bên trong", () => {
    const c = readAllComments(OWN).find((x) => x.fb_comment_id === "777")!;
    expect(c.text).toBe("Mình quan tâm link bạn tư vấn giúp");
    expect(c.author_profile_url).toBe("https://www.facebook.com/tran.thi.b");
  });

  it("comment trả lời không làm lẫn nội dung vào comment cha", () => {
    const parent = readAllComments(OWN).find((c) => c.fb_comment_id === "555")!;
    expect(parent.text).not.toContain("Dạ em đã nhắn");
  });
});

describe("tìm nút mở rộng", () => {
  it("thấy nút xem thêm bình luận và menu sắp xếp", () => {
    expect(findClickable("viewMoreComments")?.id).toBe("more");
    expect(findClickable("sortButton")?.id).toBe("sort");
  });

  it("bỏ qua nút đã đánh dấu chết", () => {
    const more = findClickable("viewMoreComments")!;
    expect(findClickable("viewMoreComments", new Set([more]))).toBeNull();
  });

  it("nút 'Gửi' không bao giờ được coi là nút mở rộng", () => {
    for (const kind of ["viewMoreComments", "viewReplies", "seeMore", "allComments", "sortButton"] as const) {
      expect(findClickable(kind)?.id).not.toBe("send");
    }
  });

  it("nút 'Xem thêm' chỉ lấy trong comment", () => {
    expect(seeMoreButtons()).toHaveLength(1);
  });
});

describe("thông tin bài cho nút Theo dõi bài này", () => {
  it("đọc tác giả (link id số trong nhóm), nhóm và nội dung bài", () => {
    const info = readPostInfo();
    expect(info).toEqual({
      ok: true,
      url: "https://www.facebook.com/groups/123456789/posts/987654321012",
      authorProfileUrl: "https://www.facebook.com/profile.php?id=100012345678",
      authorName: "Lan Trường Minh",
      groupUrl: "https://www.facebook.com/groups/123456789",
      content: "Cần in logo 500 cái, ib em nhé",
    });
  });

  it("không đọc được tác giả thì từ chối, không đoán", () => {
    document.body.innerHTML = '<div role="article"><div dir="auto">bài không có tên tác giả</div></div>';
    const info = readPostInfo();
    expect(info.ok).toBe(false);
  });

  it("không có bài trên trang thì từ chối", () => {
    document.body.innerHTML = "<div>trống</div>";
    expect(readPostInfo().ok).toBe(false);
  });
});
