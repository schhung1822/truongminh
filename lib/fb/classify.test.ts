import { describe, expect, it } from "vitest";
import { classifyComment, hasExternalLink } from "./classify";

const cat = (t: string) => classifyComment(t).category;

describe("classifyComment", () => {
  it("có số, Zalo hoặc email -> HAS_CONTACT, kể cả khi có từ khoá quan tâm", () => {
    expect(cat("0912345678")).toBe("HAS_CONTACT");
    expect(cat("mình quan tâm, sdt 0912345678")).toBe("HAS_CONTACT");
    expect(cat("ib e 0912345678")).toBe("HAS_CONTACT");
    expect(cat("mail: a@b.com")).toBe("HAS_CONTACT");
    expect(cat("zalo 0987654321")).toBe("HAS_CONTACT");
  });

  it("từ khoá quan tâm -> INTEREST", () => {
    for (const t of ["ib giá em nhé", "IB", "Inbox mình", "Quan tâm", "cần tư vấn", "Báo giá giúp", "xin giá", "check ib", "tư vấn giúp mình"]) {
      expect(cat(t)).toBe("INTEREST");
    }
  });

  it("dấu chấm hoặc chữ 'chấm' đứng riêng -> INTEREST", () => {
    expect(cat(".")).toBe("INTEREST");
    expect(cat("...")).toBe("INTEREST");
    expect(cat("chấm")).toBe("INTEREST");
    expect(cat("Chấm nha")).toBe("INTEREST");
  });

  it("'chăm' không bị nhận nhầm là 'chấm'", () => {
    expect(cat("chăm sóc khách hàng tốt")).toBe("OTHER");
  });

  it("ib nằm trong chữ khác thì không tính", () => {
    expect(cat("ibuprofen")).toBe("OTHER");
    expect(cat("nib")).toBe("OTHER");
  });

  it("câu hỏi -> QUESTION", () => {
    expect(cat("bao nhiêu vậy")).toBe("QUESTION");
    expect(cat("ở đâu ạ")).toBe("QUESTION");
    expect(cat("giá sao ạ?")).toBe("QUESTION");
    expect(cat("có làm được không")).toBe("QUESTION");
    expect(cat("giá bn")).toBe("QUESTION");
  });

  it("vừa quan tâm vừa hỏi thì lấy quan tâm", () => {
    expect(cat("ib giá bao nhiêu?")).toBe("INTEREST");
  });

  it("số viết bằng chữ -> QUESTION để người đọc", () => {
    expect(cat("không chín một hai ba bốn năm sáu bảy tám")).toBe("QUESTION");
  });

  it("link ngoài hoặc quảng cáo -> SPAM, kể cả khi có số", () => {
    expect(cat("xem tại https://abc.com sdt 0912345678")).toBe("SPAM");
    expect(cat("www.shop.vn giá rẻ")).toBe("SPAM");
    expect(cat("tuyển ctv kiếm tiền online")).toBe("SPAM");
  });

  it("link facebook hoặc zalo.me không phải spam", () => {
    expect(cat("https://www.facebook.com/abc xem giúp")).toBe("OTHER");
    expect(cat("https://zalo.me/0912345678")).toBe("HAS_CONTACT");
  });

  it("comment thường và rỗng -> OTHER", () => {
    expect(cat("đẹp quá")).toBe("OTHER");
    expect(cat("")).toBe("OTHER");
    expect(cat("   ")).toBe("OTHER");
  });

  it("trả kèm thông tin liên hệ đã tách", () => {
    const r = classifyComment("sdt 0912345678 mail a@b.com");
    expect(r.contacts.phones).toEqual(["0912345678"]);
    expect(r.contacts.emails).toEqual(["a@b.com"]);
  });
});

describe("hasExternalLink", () => {
  it("nhận link ngoài, bỏ qua facebook / zalo.me", () => {
    expect(hasExternalLink("xem https://abc.com/x")).toBe(true);
    expect(hasExternalLink("www.abc.com")).toBe(true);
    expect(hasExternalLink("https://www.facebook.com/p/1")).toBe(false);
    expect(hasExternalLink("https://m.me/page")).toBe(false);
    expect(hasExternalLink("https://zalo.me/0912345678")).toBe(false);
    expect(hasExternalLink("không có link")).toBe(false);
  });
});
