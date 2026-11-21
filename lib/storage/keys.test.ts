import { describe, expect, it } from "vitest";
import { contentTypeOf, isPublicKey, logoAiKey, logoKey, materialKey, mockupKey, randomId, safeExt, slugCode, thumbKey } from "./keys";

describe("randomId", () => {
  it("đủ độ dài, chỉ gồm chữ thường và số, và khác nhau giữa các lần gọi", () => {
    const ids = Array.from({ length: 500 }, () => randomId(16));
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{16}$/);
    expect(new Set(ids).size).toBe(500);
  });

  it("độ dài tùy chọn", () => {
    expect(randomId(10)).toHaveLength(10);
    expect(randomId(32)).toHaveLength(32);
  });
});

describe("slugCode", () => {
  it("giữ chữ thường, số và gạch ngang; bỏ dấu tiếng Việt và ký tự lạ", () => {
    expect(slugCode("LW-102")).toBe("lw-102");
    expect(slugCode("Mica đỏ / 3mm")).toBe("mica-do-3mm");
    expect(slugCode("123")).toBe("123");
    expect(slugCode("../../etc")).toBe("etc");
    expect(slugCode("!!!")).toBe("vl");
  });
});

describe("cách đặt key", () => {
  it("chất liệu: materials/{mã}/{vai trò}-{ngẫu nhiên}.webp, không lẫn mã vào đường dẫn thoát ra ngoài", () => {
    const k = materialKey("LW102", "reference");
    expect(k).toMatch(/^materials\/lw102\/reference-[a-z0-9]{10}\.webp$/);
    expect(materialKey("../x", "layer1")).toMatch(/^materials\/x\/layer1-[a-z0-9]{10}\.webp$/);
  });

  it("thay ảnh là key mới (không ghi đè): hai lần gọi cho cùng chất liệu và vai trò cho key khác nhau", () => {
    expect(materialKey("A1", "layer1")).not.toBe(materialKey("A1", "layer1"));
  });

  it("mockup: mockups/{brandId}/{yyyy-mm}/{ngẫu nhiên}.webp theo tháng của thời điểm truyền vào", () => {
    expect(mockupKey("brand1", new Date(2026, 10, 21))).toMatch(/^mockups\/brand1\/2026-11\/[a-z0-9]{16}\.webp$/);
    expect(mockupKey("brand1", new Date(2027, 0, 3))).toMatch(/\/2027-01\//);
    expect(mockupKey("b")).not.toBe(mockupKey("b"));
  });

  it("logo: logos/{customerId}/{ngẫu nhiên}.{đuôi}, đuôi được chuẩn hóa; không có tên khách hay thương hiệu", () => {
    expect(logoKey("cust1", "png")).toMatch(/^logos\/cust1\/[a-z0-9]{16}\.png$/);
    expect(logoKey("cust1", ".JPEG")).toMatch(/\.jpg$/);
    expect(logoKey("cust1", "exe")).toMatch(/\.bin$/);
  });

  it("ảnh thu nhỏ và bản logo cho AI suy ra từ key gốc", () => {
    expect(thumbKey("mockups/b/2026-11/abc.webp")).toBe("mockups/b/2026-11/abc-thumb.webp");
    expect(thumbKey("images/s/x-final.jpg")).toBe("images/s/x-final-thumb.jpg"); // ảnh cũ chưa chuyển
    expect(logoAiKey("logos/c/abc123.png")).toBe("logos/c/abc123-ai-v2.png");
    expect(logoAiKey("logos/oldid/normalized.png")).toBe("logos/oldid/normalized-ai-v2.png");
  });

  it("safeExt", () => {
    expect(safeExt("WEBP")).toBe("webp");
    expect(safeExt("php")).toBe("bin");
  });
});

describe("key công khai và loại nội dung", () => {
  it("chất liệu, mockup, logo công khai; ảnh khách gửi qua Zalo và tư liệu thì không", () => {
    expect(isPublicKey("materials/a/layer1-x.webp")).toBe(true);
    expect(isPublicKey("mockups/b/2026-11/x.webp")).toBe(true);
    expect(isPublicKey("logos/c/x.png")).toBe(true);
    expect(isPublicKey("zalo/contact/123.jpg")).toBe(false);
    expect(isPublicKey("zalo-assets/abc.mp4")).toBe(false);
    expect(isPublicKey("images/old/final.jpg")).toBe(false);
  });

  it("contentTypeOf theo đuôi", () => {
    expect(contentTypeOf("a/b.webp")).toBe("image/webp");
    expect(contentTypeOf("a/b.JPG")).toBe("image/jpeg");
    expect(contentTypeOf("a/b.mp4")).toBe("video/mp4");
    expect(contentTypeOf("a/b")).toBe("application/octet-stream");
  });
});
