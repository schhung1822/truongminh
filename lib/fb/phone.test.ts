import { describe, expect, it } from "vitest";
import { extractContacts, hasContact, normalizePhone } from "./phone";

const phones = (t: string) => extractContacts(t).phones;

describe("extractContacts: số điện thoại", () => {
  it("số trần 10 chữ số", () => {
    expect(phones("0912345678")).toEqual(["0912345678"]);
  });

  it("nằm giữa câu", () => {
    expect(phones("ib giá em nhé, số 0912345678 anh")).toEqual(["0912345678"]);
  });

  it("bỏ dấu chấm, cách, gạch giữa các chữ số", () => {
    expect(phones("ib 0912.345.678 nhé")).toEqual(["0912345678"]);
    expect(phones("0912 345 678")).toEqual(["0912345678"]);
    expect(phones("0912-345-678")).toEqual(["0912345678"]);
    expect(phones("091 234 5678")).toEqual(["0912345678"]);
  });

  it("đổi +84, 84, 0084 đầu số thành 0", () => {
    expect(phones("+84912345678")).toEqual(["0912345678"]);
    expect(phones("84912345678")).toEqual(["0912345678"]);
    expect(phones("+84 912 345 678")).toEqual(["0912345678"]);
    expect(phones("0084912345678")).toEqual(["0912345678"]);
    expect(phones("+84 (0)912 345 678")).toEqual(["0912345678"]);
  });

  it("chữ giả số o O l I trong cụm có từ 7 chữ số trở lên", () => {
    expect(phones("o912345678")).toEqual(["0912345678"]);
    expect(phones("09l2345678")).toEqual(["0912345678"]);
    expect(phones("O9I2345678")).toEqual(["0912345678"]);
    expect(phones("0912 34s 678 o912345678")).toEqual(["0912345678"]);
  });

  it("KHÔNG đổi chữ giả số khi cụm ngắn hơn 7 chữ số thật", () => {
    expect(phones("lol 123")).toEqual([]);
    expect(phones("Ilo 0000")).toEqual([]);
    expect(phones("hello 12345")).toEqual([]);
  });

  it("chỉ nhận số di động 03, 05, 07, 08, 09", () => {
    expect(phones("0356789012")).toEqual(["0356789012"]);
    expect(phones("0587654321")).toEqual(["0587654321"]);
    expect(phones("0701234567")).toEqual(["0701234567"]);
    expect(phones("0801234567")).toEqual(["0801234567"]);
    expect(phones("0123456789")).toEqual([]); // đầu 01 không phải di động
    expect(phones("0212345678")).toEqual([]); // số bàn 02
    expect(phones("0412345678")).toEqual([]);
  });

  it("sai độ dài thì bỏ", () => {
    expect(phones("091234567")).toEqual([]); // 9 số
    expect(phones("09123456789")).toEqual([]); // 11 số
    expect(phones("091234567890123456")).toEqual([]);
  });

  it("hai số trong một comment, không trùng", () => {
    expect(phones("0912345678, 0987654321")).toEqual(["0912345678", "0987654321"]);
    expect(phones("0912345678 - 0987654321")).toEqual(["0912345678", "0987654321"]);
    expect(phones("0912345678 / 0987654321")).toEqual(["0912345678", "0987654321"]);
    expect(phones("0912345678 và 0912.345.678")).toEqual(["0912345678"]);
  });

  it("không nhận số dính liền với chữ", () => {
    expect(phones("abc0912345678")).toEqual([]);
    expect(phones("0912345678abc")).toEqual([]);
  });

  it("không nhận nhầm giá tiền, ngày tháng, mã", () => {
    expect(phones("Giá 1.500.000đ / cái")).toEqual([]);
    expect(phones("ngày 20/11/2026")).toEqual([]);
    expect(phones("đơn 20-11-2026")).toEqual([]);
    expect(phones("10.000.000.000")).toEqual([]);
  });

  it("chữ I hoặc l đứng riêng trước số không làm hỏng số", () => {
    expect(phones("I 0912345678")).toEqual(["0912345678"]);
    expect(phones("IB 0912345678")).toEqual(["0912345678"]);
    expect(phones("lo 0912345678")).toEqual(["0912345678"]);
  });
});

describe("extractContacts: Zalo và email", () => {
  it("số sau chữ zalo", () => {
    const c = extractContacts("Zalo: 091 234 5678");
    expect(c.zalo).toBe("0912345678");
    expect(c.phones).toEqual(["0912345678"]);
    expect(extractContacts("zl 0987654321").zalo).toBe("0987654321");
  });

  it("link zalo.me", () => {
    const c = extractContacts("kết bạn zalo.me/0912345678 nhé");
    expect(c.zalo).toBe("0912345678");
    expect(c.phones).toEqual(["0912345678"]);
  });

  it("số điện thoại khác số Zalo: giữ cả hai", () => {
    const c = extractContacts("sdt 0912345678 zalo 0987654321");
    expect(c.phones).toEqual(["0912345678", "0987654321"]);
    expect(c.zalo).toBe("0987654321");
  });

  it("chữ zalo mà không có số thì không có zalo", () => {
    expect(extractContacts("add zalo em nhé").zalo).toBeNull();
  });

  it("email, chuẩn hoá chữ thường, không trùng", () => {
    expect(extractContacts("mail abc.def@Gmail.com nhé").emails).toEqual(["abc.def@gmail.com"]);
    expect(extractContacts("a@b.vn, a@b.vn").emails).toEqual(["a@b.vn"]);
    expect(extractContacts("hết rồi.").emails).toEqual([]);
  });
});

describe("extractContacts: số viết bằng chữ", () => {
  it("dãy từ chỉ chữ số đủ dài thì báo spelledOut, không tách số", () => {
    const c = extractContacts("không chín một hai ba bốn năm sáu bảy tám");
    expect(c.spelledOut).toBe(true);
    expect(c.phones).toEqual([]);
  });

  it("câu thường có chữ 'ba', 'năm', 'sáu' không bị nhận nhầm", () => {
    expect(extractContacts("ba mẹ năm nay sáu tuổi").spelledOut).toBe(false);
    expect(extractContacts("một hai ba").spelledOut).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("chuẩn hoá một giá trị", () => {
    expect(normalizePhone("0912 345 678")).toBe("0912345678");
    expect(normalizePhone("+84 912 345 678")).toBe("0912345678");
    expect(normalizePhone("  0912.345.678  ")).toBe("0912345678");
  });

  it("không hợp lệ hoặc mơ hồ thì null", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("0123456789")).toBeNull();
    expect(normalizePhone("0912345678 / 0987654321")).toBeNull();
    expect(normalizePhone("0912345678 - 0987654321")).toBeNull(); // hai số
  });
});

describe("hasContact", () => {
  it("true khi có số, zalo hoặc email", () => {
    expect(hasContact(extractContacts("0912345678"))).toBe(true);
    expect(hasContact(extractContacts("a@b.vn"))).toBe(true);
    expect(hasContact(extractContacts("đẹp quá"))).toBe(false);
  });
});
