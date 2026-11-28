import { describe, expect, it } from "vitest";
import { prepareComment } from "./comments";
import { canonicalPageUrl } from "./urls";

const now = new Date("2026-11-28T03:00:00Z");
const ctx = {
  accountProfileUrl: "https://www.facebook.com/lan.truongminh",
  now,
  ownPages: [{ name: "Vật Liệu Logo ABC", url: "https://www.facebook.com/profile.php?id=61500000001" }],
};
const base = { fb_comment_id: "900", parent_fb_comment_id: "501", author_name: "Vật Liệu Logo ABC", author_profile_url: null, is_own: false, text: "Dạ bên em là Vật Liệu Logo ABC, hotline 0987 654 321", time_text: "Vừa xong" };

describe("comment do fanpage của mình viết (v1.1: fanpage trả lời comment)", () => {
  it("trùng tên fanpage: tính là comment của mình, không tách số, không thành lead", () => {
    const c = prepareComment(base, ctx);
    expect(c.isOwn).toBe(true);
    expect(c.category).toBe("OTHER");
    expect(c.extractedPhone).toBeNull();
    expect(c.extractedOther).toBeNull();
  });

  it("trùng link fanpage (trong nhóm, link người viết là dạng /groups/.../user/<id>)", () => {
    const c = prepareComment({ ...base, author_name: "Tên hiển thị khác", author_profile_url: "https://www.facebook.com/groups/123456789/user/61500000001/" }, ctx);
    expect(c.isOwn).toBe(true);
  });

  it("so tên không phân biệt dấu, hoa thường; tên gần giống thì không tính", () => {
    expect(prepareComment({ ...base, author_name: "vat lieu logo abc" }, ctx).isOwn).toBe(true);
    expect(prepareComment({ ...base, author_name: "Vật Liệu Logo ABC Hà Nội" }, ctx).isOwn).toBe(false);
  });

  it("người khác vẫn được tách số như cũ; không khai fanpage thì hành vi cũ không đổi", () => {
    const other = prepareComment({ ...base, author_name: "Xưởng May A", text: "LH 0912 345 678" }, ctx);
    expect(other).toMatchObject({ isOwn: false, category: "HAS_CONTACT", extractedPhone: "0912345678" });
    const noPages = prepareComment(base, { accountProfileUrl: ctx.accountProfileUrl, now });
    expect(noPages).toMatchObject({ isOwn: false, extractedPhone: "0987654321" });
  });
});

describe("canonicalPageUrl", () => {
  it("nhận tên trang và profile.php", () => {
    expect(canonicalPageUrl("facebook.com/vatlieulogo.abc")).toBe("https://www.facebook.com/vatlieulogo.abc");
    expect(canonicalPageUrl("https://www.facebook.com/profile.php?id=61500000001&sk=about")).toBe("https://www.facebook.com/profile.php?id=61500000001");
  });
  it("các dạng riêng của trang quy về id số", () => {
    expect(canonicalPageUrl("https://www.facebook.com/people/Vat-Lieu-ABC/61500000001/")).toBe("https://www.facebook.com/profile.php?id=61500000001");
    expect(canonicalPageUrl("https://www.facebook.com/pages/Vat-Lieu-ABC/123456789012")).toBe("https://www.facebook.com/profile.php?id=123456789012");
    expect(canonicalPageUrl("https://www.facebook.com/p/Vat-Lieu-ABC-61500000001/")).toBe("https://www.facebook.com/profile.php?id=61500000001");
  });
  it("link không phải trang thì null", () => {
    for (const u of ["", "https://example.com/abc", "https://www.facebook.com/groups/123456789", "https://www.facebook.com/people/Ten", "https://www.facebook.com/p/khong-co-so", "https://www.facebook.com/lan/posts/123456"]) {
      expect(canonicalPageUrl(u), u).toBeNull();
    }
  });
});
