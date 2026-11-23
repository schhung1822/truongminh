// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.facebook.com/groups/123456789/posts/987654321012/"}
import { beforeEach, describe, expect, it } from "vitest";
import { commentArticles, commentScrollContainer, diagnose, findClickable, mainPostArticle, mainPostRoot, pageCommentCount, postAuthorLink, readAllComments, readPostInfo, scrollCommentArea, seeMoreButtons } from "./extract";

/**
 * Kiểm tra logic đọc trang trên các trang HTML MÔ PHỎNG cấu trúc Facebook (article lồng nhau, link thời gian có comment_id,
 * nút "Xem thêm bình luận"...). Đây là giả định của người viết, KHÔNG phải trang Facebook thật: test chỉ chứng minh logic nhất quán
 * với giả định đó. Phải chạy thử trên bài thật (nút "Chẩn đoán trang này" cho ra báo cáo để chỉnh).
 */
const FIXTURE = `
<div role="article" aria-label="Bài viết của Lan Trường Minh">
  <h3><a href="https://www.facebook.com/groups/123456789/user/100012345678/?__cft__[0]=x"><span>Lan Trường Minh</span></a></h3>
  <div data-ad-comet-preview="message"><div dir="auto">Cần in logo 500 cái, ib em nhé</div></div>
  <span>3 bình luận</span>
  <div role="button" id="sort">Phù hợp nhất</div>

  <div role="article" aria-label="Bình luận của Nguyễn Văn A">
    <a role="link" href="https://www.facebook.com/groups/123456789/user/200000001/?comment_id=555"><span>Nguyễn Văn A</span></a>
    <span>Tác giả</span>
    <div dir="auto"><div dir="auto">ib giá em nhé 0912.345.678</div></div>
    <div role="button">Thích</div><div role="button">Phản hồi</div>
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

/** Trang không có link thời gian kèm comment_id (giả định xấu nhất): chỉ còn aria-label và chữ. */
const FIXTURE_NO_LINKS = `
<div role="main">
  <div data-ad-comet-preview="message"><div dir="auto">Bài không có article</div></div>
  <h2><a href="https://www.facebook.com/profile.php?id=61596612322186">Hương Hương</a></h2>
  <span>2 bình luận</span>
  <div role="article" aria-label="Bình luận của Khách Một">
    <a href="https://www.facebook.com/khach.mot">Khách Một</a>
    <div dir="auto">cần báo giá 0912 345 678</div>
    <a href="#">3 giờ</a>
  </div>
  <div role="article" aria-label="Bình luận của Hương Hương">
    <a href="https://www.facebook.com/profile.php?id=61596612322186">Hương Hương</a>
    <div dir="auto">đã nhắn bạn nhé 0901 234 567</div>
  </div>
</div>`;

const OWN = { profileUrl: "https://www.facebook.com/lan.truongminh", displayName: "Lan Trường Minh" };

beforeEach(() => {
  document.body.innerHTML = FIXTURE;
  // jsdom không có bố cục nên mọi phần tử có kích thước 0: giả lập "đang hiện" để hàm tìm nút hoạt động
  Element.prototype.getBoundingClientRect = () => ({ width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  Element.prototype.scrollIntoView = () => undefined;
});

describe("đọc comment", () => {
  it("chỉ lấy article là bình luận, không lấy bài chính", () => {
    expect(commentArticles()).toHaveLength(3);
    expect(mainPostArticle()?.getAttribute("aria-label")).toContain("Bài viết");
  });

  it("đọc đủ 3 comment, đúng mã, mã cha, tên, link, thời gian; link tên người viết có comment_id không bị nhầm là link thời gian", () => {
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
      fallbackId: false,
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

  it("bỏ nhãn 'Xem thêm', 'Tác giả' và giữ chữ của comment có link bên trong", () => {
    const c = readAllComments(OWN).find((x) => x.fb_comment_id === "777")!;
    expect(c.text).toBe("Mình quan tâm link bạn tư vấn giúp");
    expect(c.author_profile_url).toBe("https://www.facebook.com/tran.thi.b");
    expect(readAllComments(OWN).find((x) => x.fb_comment_id === "555")!.text).not.toContain("Tác giả");
  });

  it("comment trả lời không làm lẫn nội dung vào comment cha", () => {
    const parent = readAllComments(OWN).find((c) => c.fb_comment_id === "555")!;
    expect(parent.text).not.toContain("Dạ em đã nhắn");
  });
});

describe("trang không có link thời gian kèm comment_id (dự phòng)", () => {
  beforeEach(() => {
    document.body.innerHTML = FIXTURE_NO_LINKS;
  });
  const own = { profileUrl: "https://www.facebook.com/profile.php?id=61596612322186", displayName: "Hương Hương" };

  it("vẫn đọc được bình luận nhờ aria-label, dùng mã tạm ổn định, vẫn nhận ra comment của mình", () => {
    const all = readAllComments(own);
    expect(all).toHaveLength(2);
    const guest = all.find((c) => c.author_name === "Khách Một")!;
    expect(guest.fallbackId).toBe(true);
    expect(guest.fb_comment_id).toMatch(/^h[a-z0-9]+$/);
    expect(guest.text).toBe("cần báo giá 0912 345 678");
    expect(guest.time_text).toBe("3 giờ");
    expect(guest.is_own).toBe(false);
    const mine = all.find((c) => c.author_name === "Hương Hương")!;
    expect(mine.is_own).toBe(true);
    // quét lại ra cùng mã
    expect(readAllComments(own).find((c) => c.author_name === "Khách Một")!.fb_comment_id).toBe(guest.fb_comment_id);
  });

  it("không có article bài chính thì vẫn tìm được tác giả bài và vùng bài", () => {
    expect(mainPostArticle()).toBeNull();
    expect(mainPostRoot().getAttribute("role")).toBe("main");
    expect(postAuthorLink(mainPostRoot())?.textContent).toBe("Hương Hương");
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

  it("vẫn cho theo dõi bài của người khác hoặc khi Facebook không hiển thị tác giả", () => {
    document.body.innerHTML = '<div role="article"><div dir="auto">bài không có tên tác giả</div></div>';
    const info = readPostInfo();
    expect(info).toMatchObject({ ok: true, authorProfileUrl: null, authorName: null });
  });

  it("không có bài trên trang thì từ chối", () => {
    document.body.innerHTML = "<div>trống</div>";
    expect(readPostInfo().ok).toBe(false);
  });
});

describe("tổng comment và vùng cuộn", () => {
  it("đọc tổng từ aria-label khi giao diện chỉ hiện số cạnh biểu tượng", () => {
    document.body.innerHTML = '<div role="dialog"><div role="article"><div dir="auto">Bài</div><button aria-label="75 bình luận"><span>75</span></button></div></div>';
    expect(pageCommentCount()).toBe(75);
  });

  it("cuộn div của dialog thay vì chỉ cuộn window", () => {
    document.body.innerHTML = '<div role="dialog"><div id="scroller" style="overflow-y:auto"><div role="article"><div dir="auto">Bài</div><div role="article" aria-label="Bình luận của A"><div dir="auto">Nội dung</div></div></div></div></div>';
    const scroller = document.querySelector<HTMLElement>("#scroller")!;
    Object.defineProperties(scroller, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 } });
    expect(commentScrollContainer()).toBe(scroller);
    scrollCommentArea("bottom");
    expect(scroller.scrollTop).toBe(700);
  });
});

describe("báo cáo chẩn đoán", () => {
  it("có số đếm, nhãn nút, mẫu link; KHÔNG chứa tên người, nội dung comment hay số điện thoại", () => {
    const r = diagnose(OWN);
    expect(r.counts).toMatchObject({ articles: 4, articlesWithCommentLink: 3, articlesWithCommentLabel: 3, commentsRead: 3, commentsWithFallbackId: 0, ownComments: 1, repliesRead: 1, commentsWithPhone: 2 });
    expect(r.deep).toBeNull();
    const deep = diagnose(OWN, { expanded: true, steps: 3, complete: true, seconds: 5 });
    expect(deep.deep).toEqual({ expanded: true, steps: 3, complete: true, seconds: 5 });
    for (const secret of ["0912", "0987654321", "Nguyễn Văn A"]) expect(JSON.stringify(deep), secret).not.toContain(secret);
    const observed = readAllComments(OWN);
    document.querySelectorAll('[role="article"] [role="article"]').forEach((article) => article.remove());
    const observedReport = diagnose(OWN, { expanded: true, steps: 4, complete: true, seconds: 6, stableRounds: 3, reportedCount: 3 }, observed);
    expect(observedReport.counts.commentsRead).toBe(3);
    for (const secret of ["0912", "0987654321", "Nguyễn Văn A"]) expect(JSON.stringify(observedReport), secret).not.toContain(secret);
    expect(r.buttons.viewMoreComments).toEqual(["Xem thêm 2 bình luận"]);
    expect(r.sortButtonLabel).toBe("Phù hợp nhất");
    expect(r.commentCountText).toBe("3 bình luận");
    expect(r.postAuthorFound).toBe(true);
    expect(r.mainPostFound).toBe(true);
    expect(r.isPostUrl).toBe(true);
    expect(r.linkPatterns.some((p) => p.includes("comment_id"))).toBe(true);
    const text = JSON.stringify(r);
    for (const secret of ["Nguyễn Văn A", "Trần Thị B", "0912", "0987654321", "ib giá", "200000001", "100012345678"]) expect(text, secret).not.toContain(secret);
  });
});
