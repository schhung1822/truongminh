import { describe, expect, it } from "vitest";
import { boardStamp, buildPinCaption, canAnnounce, CATCH_UP_MAX_MS, dailyPollCalls, DEFAULT_PIN_FEED_CAPTION, pinUrl } from "./feed";

describe("boardStamp", () => {
  it("đổi khi số pin hoặc mốc thay đổi của board đổi", () => {
    const base = boardStamp({ pin_count: 12, board_pins_modified_at: "2026-11-27T02:00:00Z" });
    expect(boardStamp({ pin_count: 13, board_pins_modified_at: "2026-11-27T02:00:00Z" })).not.toBe(base);
    expect(boardStamp({ pin_count: 12, board_pins_modified_at: "2026-11-27T02:05:00Z" })).not.toBe(base);
    expect(boardStamp({ pin_count: 12, board_pins_modified_at: "2026-11-27T02:00:00Z" })).toBe(base);
  });

  it("cùng một thời điểm viết hai cách thì vẫn ra một dấu", () => {
    expect(boardStamp({ pin_count: 3, board_pins_modified_at: "2026-11-27T02:00:00" + "Z" })).toBe(boardStamp({ pin_count: 3, board_pins_modified_at: "2026-11-27T02:00:00.000+00:00" }));
  });

  it("thiếu số pin hoặc mốc thời gian (hoặc mốc không đọc được) thì không lỗi", () => {
    expect(boardStamp({})).toBe("0|");
    expect(boardStamp({ pin_count: null, board_pins_modified_at: null })).toBe("0|");
    expect(boardStamp({ pin_count: 5, board_pins_modified_at: "không phải ngày" })).toBe("5|");
  });
});

describe("canAnnounce", () => {
  const now = Date.parse("2026-11-27T03:00:00Z");

  it("board đang được theo dõi liên tục thì pin mới được gửi", () => {
    expect(canAnnounce(new Date(now - 2 * 60_000), now)).toBe(true);
    expect(canAnnounce(new Date(now - CATCH_UP_MAX_MS), now)).toBe(true); // ngừng dưới 24 giờ (máy chủ khởi động lại): gửi bù
  });

  it("chưa xem lần nào (vừa bật lại chức năng) hoặc ngừng quá 24 giờ thì chỉ nhập pin, không gửi", () => {
    expect(canAnnounce(null, now)).toBe(false);
    expect(canAnnounce(undefined, now)).toBe(false);
    expect(canAnnounce(new Date(now - CATCH_UP_MAX_MS - 1), now)).toBe(false);
  });
});

describe("buildPinCaption", () => {
  const pin = { boardName: "Tem da", title: "Tem da nâu", description: "May viền", pinterestPinId: "987" };

  it("mẫu mặc định chỉ ghi tên board", () => {
    expect(buildPinCaption(pin)).toBe("Mẫu mới · Tem da");
    expect(DEFAULT_PIN_FEED_CAPTION).toContain("{board}");
  });

  it("điền tiêu đề, mô tả, link; dòng thiếu thông tin thì bỏ", () => {
    const template = "Mẫu mới: {tieu_de}\n{mo_ta}\nXem: {link}";
    expect(buildPinCaption(pin, template)).toBe("Mẫu mới: Tem da nâu\nMay viền\nXem: https://www.pinterest.com/pin/987/");
    expect(buildPinCaption({ ...pin, title: null, description: "  " }, template)).toBe("Xem: https://www.pinterest.com/pin/987/");
  });

  it("mẫu trống thì không có chữ (chỉ gửi ảnh)", () => {
    expect(buildPinCaption(pin, "")).toBe("");
    expect(buildPinCaption({ ...pin, title: "" }, "{tieu_de}")).toBe("");
  });

  it("cắt ở 2000 ký tự theo giới hạn của Zalo", () => {
    expect(buildPinCaption({ ...pin, description: "x".repeat(3000) }, "{mo_ta}")).toHaveLength(2000);
  });
});

describe("dailyPollCalls / pinUrl", () => {
  it("mỗi lần hỏi một lượt gọi", () => {
    expect(dailyPollCalls(120)).toBe(720);
    expect(dailyPollCalls(60)).toBe(1440);
    expect(dailyPollCalls(90)).toBe(960);
  });

  it("link pin", () => {
    expect(pinUrl("123")).toBe("https://www.pinterest.com/pin/123/");
  });
});
