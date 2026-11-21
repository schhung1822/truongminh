import { describe, expect, it } from "vitest";
import { canonicalGroupUrl, canonicalProfileUrl, groupNameFromUrl, parsePostUrl, profileUrlFromAnyLink, sameProfile } from "./urls";

describe("canonicalProfileUrl", () => {
  it("chuẩn hoá host, bỏ tham số", () => {
    expect(canonicalProfileUrl("https://m.facebook.com/lan.truongminh?ref=bookmarks")).toBe("https://www.facebook.com/lan.truongminh");
    expect(canonicalProfileUrl("facebook.com/lan.truongminh/")).toBe("https://www.facebook.com/lan.truongminh");
    expect(canonicalProfileUrl("https://web.facebook.com/lan.truongminh")).toBe("https://www.facebook.com/lan.truongminh");
  });

  it("profile.php chỉ giữ tham số id", () => {
    expect(canonicalProfileUrl("https://www.facebook.com/profile.php?id=100012345678&sk=photos")).toBe("https://www.facebook.com/profile.php?id=100012345678");
    expect(canonicalProfileUrl("https://www.facebook.com/profile.php")).toBeNull();
  });

  it("không phải trang cá nhân thì null", () => {
    expect(canonicalProfileUrl("https://www.facebook.com/groups/abc")).toBeNull();
    expect(canonicalProfileUrl("https://www.facebook.com/")).toBeNull();
    expect(canonicalProfileUrl("https://example.com/lan")).toBeNull();
    expect(canonicalProfileUrl("")).toBeNull();
    expect(canonicalProfileUrl("không phải link")).toBeNull();
  });
});

describe("canonicalGroupUrl", () => {
  it("lấy phần nhóm, bỏ phần sau", () => {
    expect(canonicalGroupUrl("https://www.facebook.com/groups/123456789/?ref=share")).toBe("https://www.facebook.com/groups/123456789");
    expect(canonicalGroupUrl("https://m.facebook.com/groups/in-an-quang-cao/posts/987654321/")).toBe("https://www.facebook.com/groups/in-an-quang-cao");
  });

  it("không phải nhóm thì null", () => {
    expect(canonicalGroupUrl("https://www.facebook.com/lan.truongminh")).toBeNull();
    expect(canonicalGroupUrl("https://www.facebook.com/groups/feed/")).toBeNull();
    expect(canonicalGroupUrl("https://www.facebook.com/groups/")).toBeNull();
  });
});

describe("parsePostUrl", () => {
  it("bài trong nhóm: posts và permalink về cùng một dạng", () => {
    const a = parsePostUrl("https://www.facebook.com/groups/123456789/posts/987654321012/?__cft__[0]=abc&__tn__=%2CO%2CP-R");
    expect(a).toEqual({ url: "https://www.facebook.com/groups/123456789/posts/987654321012", groupUrl: "https://www.facebook.com/groups/123456789" });
    const b = parsePostUrl("https://m.facebook.com/groups/123456789/permalink/987654321012/");
    expect(b?.url).toBe(a?.url);
  });

  it("bài trên trang cá nhân hoặc fanpage", () => {
    expect(parsePostUrl("https://www.facebook.com/lan.truongminh/posts/pfbid02AbCdEf123")).toEqual({
      url: "https://www.facebook.com/lan.truongminh/posts/pfbid02AbCdEf123",
      groupUrl: null,
    });
  });

  it("permalink.php", () => {
    expect(parsePostUrl("https://www.facebook.com/permalink.php?story_fbid=pfbid0abcdef&id=100012345678&comment_id=1")).toEqual({
      url: "https://www.facebook.com/permalink.php?story_fbid=pfbid0abcdef&id=100012345678",
      groupUrl: null,
    });
    expect(parsePostUrl("https://www.facebook.com/permalink.php?story_fbid=123")).toBeNull();
  });

  it("link chia sẻ rút gọn", () => {
    expect(parsePostUrl("https://www.facebook.com/share/p/1AbCdEfGh/")?.url).toBe("https://www.facebook.com/share/p/1AbCdEfGh/");
  });

  it("không phải bài đăng thì null", () => {
    expect(parsePostUrl("https://www.facebook.com/")).toBeNull();
    expect(parsePostUrl("https://www.facebook.com/lan.truongminh")).toBeNull();
    expect(parsePostUrl("https://www.facebook.com/groups/123456789")).toBeNull();
    expect(parsePostUrl("https://www.facebook.com/groups/123456789/members")).toBeNull();
    expect(parsePostUrl("https://evil.com/groups/1/posts/123456")).toBeNull();
    expect(parsePostUrl("https://facebook.com.evil.com/lan/posts/123456")).toBeNull();
    expect(parsePostUrl("")).toBeNull();
  });
});

describe("sameProfile", () => {
  it("so sau khi chuẩn hoá, không phân biệt hoa thường", () => {
    expect(sameProfile("https://m.facebook.com/Lan.TruongMinh?x=1", "https://www.facebook.com/lan.truongminh/")).toBe(true);
    expect(sameProfile("https://www.facebook.com/profile.php?id=100012345678&sk=a", "facebook.com/profile.php?id=100012345678")).toBe(true);
    expect(sameProfile("https://www.facebook.com/a.b.c", "https://www.facebook.com/x.y.z")).toBe(false);
    expect(sameProfile(null, "https://www.facebook.com/a.b.c")).toBe(false);
  });
});

describe("groupNameFromUrl", () => {
  it("nhóm số và nhóm chữ", () => {
    expect(groupNameFromUrl("https://www.facebook.com/groups/123456789")).toBe("Nhóm 123456789");
    expect(groupNameFromUrl("https://www.facebook.com/groups/in-an-quang-cao")).toBe("in an quang cao");
    expect(groupNameFromUrl("https://www.facebook.com/lan")).toBe("Nhóm Facebook");
  });
});

describe("profileUrlFromAnyLink", () => {
  it("link người dùng trong nhóm đổi về profile.php?id", () => {
    expect(profileUrlFromAnyLink("https://www.facebook.com/groups/123456789/user/100012345678/?__cft__[0]=x")).toBe("https://www.facebook.com/profile.php?id=100012345678");
  });

  it("dạng thường vẫn chuẩn hoá như cũ", () => {
    expect(profileUrlFromAnyLink("https://m.facebook.com/lan.truongminh?ref=x")).toBe("https://www.facebook.com/lan.truongminh");
    expect(profileUrlFromAnyLink("https://www.facebook.com/profile.php?id=100012345678&sk=a")).toBe("https://www.facebook.com/profile.php?id=100012345678");
  });

  it("không phải link người dùng thì null", () => {
    expect(profileUrlFromAnyLink("https://www.facebook.com/groups/123456789/posts/987654321")).toBeNull();
    expect(profileUrlFromAnyLink("https://example.com/groups/1/user/100012345678/")).toBeNull();
  });
});
