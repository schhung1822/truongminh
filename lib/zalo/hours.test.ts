import { describe, expect, it } from "vitest";
import { describeHours, isWithinHours } from "./hours";

const TZ = "Asia/Ho_Chi_Minh"; // UTC+7
const office = { start: "08:00", end: "17:30", days: [1, 2, 3, 4, 5, 6] };

/** Giờ địa phương Việt Nam -> Date (UTC). 2026-11-18 là thứ Tư. */
const vn = (iso: string) => new Date(`${iso}+07:00`);

describe("isWithinHours", () => {
  it("trong giờ, ngày làm việc", () => {
    expect(isWithinHours(vn("2026-11-18T09:00:00"), TZ, office)).toBe(true);
    expect(isWithinHours(vn("2026-11-18T17:29:00"), TZ, office)).toBe(true);
  });

  it("đúng giờ bắt đầu tính là trong giờ, đúng giờ kết thúc là ngoài giờ", () => {
    expect(isWithinHours(vn("2026-11-18T08:00:00"), TZ, office)).toBe(true);
    expect(isWithinHours(vn("2026-11-18T17:30:00"), TZ, office)).toBe(false);
  });

  it("ngoài giờ trong ngày làm việc", () => {
    expect(isWithinHours(vn("2026-11-18T07:59:00"), TZ, office)).toBe(false);
    expect(isWithinHours(vn("2026-11-18T22:00:00"), TZ, office)).toBe(false);
  });

  it("ngày nghỉ (Chủ nhật 2026-11-22) là ngoài giờ dù giờ nào", () => {
    expect(isWithinHours(vn("2026-11-22T10:00:00"), TZ, office)).toBe(false);
  });

  it("tính theo múi giờ cấu hình, không theo múi giờ máy", () => {
    // 02:00 UTC = 09:00 giờ Việt Nam (trong giờ) nhưng = 21:00 hôm trước ở New York (ngoài giờ)
    const t = new Date("2026-11-18T02:00:00Z");
    expect(isWithinHours(t, TZ, office)).toBe(true);
    expect(isWithinHours(t, "America/New_York", office)).toBe(false);
  });

  it("giờ bắt đầu = giờ kết thúc nghĩa là cả ngày", () => {
    const all = { start: "00:00", end: "00:00", days: [3] };
    expect(isWithinHours(vn("2026-11-18T03:00:00"), TZ, all)).toBe(true);
    expect(isWithinHours(vn("2026-11-19T03:00:00"), TZ, all)).toBe(false);
  });

  it("ca qua đêm 18:00-02:00 tính ngày theo ngày bắt đầu ca", () => {
    const night = { start: "18:00", end: "02:00", days: [3] }; // thứ Tư
    expect(isWithinHours(vn("2026-11-18T20:00:00"), TZ, night)).toBe(true); // thứ Tư tối
    expect(isWithinHours(vn("2026-11-19T01:00:00"), TZ, night)).toBe(true); // rạng sáng thứ Năm vẫn thuộc ca thứ Tư
    expect(isWithinHours(vn("2026-11-19T20:00:00"), TZ, night)).toBe(false); // thứ Năm tối không làm
    expect(isWithinHours(vn("2026-11-18T10:00:00"), TZ, night)).toBe(false);
  });
});

describe("describeHours", () => {
  it("liệt kê ngày theo thứ tự thứ hai đến Chủ nhật", () => {
    expect(describeHours(office)).toBe("Thứ hai, Thứ ba, Thứ tư, Thứ năm, Thứ sáu, Thứ bảy, từ 08:00 đến 17:30");
    expect(describeHours({ start: "09:00", end: "18:00", days: [0, 1] })).toBe("Thứ hai, Chủ nhật, từ 09:00 đến 18:00");
  });

  it("đủ bảy ngày thì nói mọi ngày", () => {
    expect(describeHours({ start: "08:00", end: "20:00", days: [0, 1, 2, 3, 4, 5, 6] })).toBe("Mọi ngày, từ 08:00 đến 20:00");
  });
});
