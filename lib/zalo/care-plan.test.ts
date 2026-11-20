import { describe, expect, it } from "vitest";
import { buildPlanPrompt, extractJson, parsePlan, PLAN_MARKER, summarizeWeather, upcomingHolidays, zonedDateTime } from "./care-plan";

const TZ = "Asia/Ho_Chi_Minh";

describe("upcomingHolidays", () => {
  it("tìm ngày lễ trong vài ngày tới, kèm số ngày còn lại", () => {
    const h = upcomingHolidays("2026-11-18", 3);
    expect(h).toEqual([{ date: "2026-11-20", name: "Ngày Nhà giáo Việt Nam 20/11", inDays: 2 }]);
  });

  it("có Black Friday (thứ Sáu thứ tư tháng 11) và Giáng sinh", () => {
    const names = upcomingHolidays("2026-11-20", 40).map((x) => `${x.date} ${x.name}`);
    expect(names).toContain("2026-11-27 Black Friday");
    expect(names).toContain("2026-12-25 Giáng sinh");
  });

  it("vượt qua năm mới và có Tết âm lịch", () => {
    const names = upcomingHolidays("2026-12-30", 45).map((x) => x.name);
    expect(names).toContain("Tết Dương lịch");
    expect(names).toContain("Tết Nguyên đán (mùng 1)");
  });

  it("không có lễ thì trả mảng rỗng", () => {
    expect(upcomingHolidays("2026-07-10", 2)).toEqual([]);
  });
});

describe("zonedDateTime và thời tiết", () => {
  it("giờ Việt Nam đổi đúng sang UTC", () => {
    expect(zonedDateTime("2026-11-19", "07:30", TZ)?.toISOString()).toBe("2026-11-19T00:30:00.000Z");
    expect(zonedDateTime("2026-11-19", "7:05", TZ)?.toISOString()).toBe("2026-11-19T00:05:00.000Z");
  });
  it("giờ sai định dạng thì null", () => {
    expect(zonedDateTime("2026-11-19", "25:00", TZ)).toBeNull();
    expect(zonedDateTime("2026-11-19", "abc", TZ)).toBeNull();
    expect(zonedDateTime("bad", "10:00", TZ)).toBeNull();
  });
  it("rút gọn dự báo Open-Meteo", () => {
    expect(
      summarizeWeather({ time: ["2026-11-19"], temperature_2m_max: [19.6], temperature_2m_min: [14.2], precipitation_probability_max: [70] }),
    ).toEqual([{ date: "2026-11-19", tMax: 20, tMin: 14, rainProb: 70 }]);
    expect(summarizeWeather(undefined)).toEqual([]);
  });
});

describe("extractJson", () => {
  it("đọc JSON thường, JSON trong khối code và JSON kèm chữ thừa", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Đây là kịch bản: {"a":3} cảm ơn')).toEqual({ a: 3 });
  });
  it("không có JSON thì báo lỗi", () => {
    expect(() => extractJson("không có gì")).toThrow(/kịch bản/);
  });
});

describe("parsePlan", () => {
  const now = new Date("2026-11-18T08:00:00Z"); // 15:00 giờ VN
  const base = { days: ["2026-11-19", "2026-11-20"], postsPerDay: 2, mediaCodes: new Map<string, "IMAGE" | "VIDEO">([["I1", "IMAGE"], ["A1", "VIDEO"]]), now, tz: TZ };
  const post = (o: object) => ({ date: "2026-11-19", time: "08:00", kind: "TEXT", text: "Chào cả nhà", ...o });

  it("nhận bài hợp lệ và sắp xếp theo giờ", () => {
    const r = parsePlan(JSON.stringify({ posts: [post({ time: "19:30" }), post({ time: "08:00" })] }), base);
    expect(r.map((p) => p.scheduledAt.toISOString())).toEqual(["2026-11-19T01:00:00.000Z", "2026-11-19T12:30:00.000Z"]);
  });

  it("bỏ bài sai ngày, sai giờ, quá giới hạn mỗi ngày", () => {
    const r = parsePlan(
      JSON.stringify({ posts: [post({ date: "2026-12-01" }), post({ time: "99:99" }), post({ time: "08:00" }), post({ time: "12:00" }), post({ time: "20:00" })] }),
      base,
    );
    expect(r).toHaveLength(2);
  });

  it("bỏ bài đã qua giờ", () => {
    const r = parsePlan(JSON.stringify({ posts: [post({ date: "2026-11-19", time: "08:00" })] }), { ...base, now: new Date("2026-11-19T01:00:00Z") });
    expect(r).toHaveLength(0);
  });

  it("ảnh/video có mã đúng được giữ, mã không tồn tại thì chuyển thành TEXT", () => {
    const r = parsePlan(JSON.stringify({ posts: [post({ kind: "IMAGE", media: "I1" }), post({ time: "12:00", kind: "VIDEO", media: "ZZ" })] }), base);
    expect(r[0]).toMatchObject({ kind: "IMAGE", mediaCode: "I1" });
    expect(r[1]).toMatchObject({ kind: "TEXT", mediaCode: null });
  });

  it("AI ghi sai loại thì theo loại thật của tư liệu", () => {
    const r = parsePlan(JSON.stringify({ posts: [post({ kind: "IMAGE", media: "A1" })] }), base);
    expect(r[0].kind).toBe("VIDEO");
  });

  it("TEXT mà kèm mã tư liệu hợp lệ thì theo loại tư liệu; thiếu mục bắt buộc thì bỏ bài", () => {
    const r = parsePlan(JSON.stringify({ posts: [post({ media: "I1" }), { date: "2026-11-19", time: "12:00" }] }), base);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "IMAGE", mediaCode: "I1" });
  });
});

describe("buildPlanPrompt", () => {
  it("có dấu hiệu nhận biết, insight, ngày cần lên, thời tiết, ngày lễ và tư liệu", () => {
    const { system, user } = buildPlanPrompt({
      now: "Thứ Tư 18/11/2026 15:00",
      days: ["2026-11-19"],
      postsPerDay: 3,
      groupName: "Nhóm Cafe",
      insight: "Chủ quán cafe, thích ly sứ in logo",
      workshopName: "Xưởng A",
      location: "Hà Nội",
      weather: [{ date: "2026-11-19", tMax: 18, tMin: 13, rainProb: 60 }],
      holidays: [{ date: "2026-11-20", name: "Ngày Nhà giáo", inDays: 2 }],
      recentPosts: ["Bài cũ về mica"],
      recentGroupMessages: [],
      materials: "CÁC CHẤT LIỆU XƯỞNG ĐANG CÓ (1 loại):\nMica trong",
      media: [{ code: "I1", kind: "IMAGE", label: "Nextgency · Ảnh 1" }],
      knowledge: "KIẾN THỨC CỦA XƯỞNG:\n### Thử\nNội dung thử",
    });
    expect(system).toContain(PLAN_MARKER);
    expect(system).toContain("Nội dung thử");
    expect(user).toContain("Mica trong");
    expect(system).not.toMatch(/in UV|in khắc/);
    expect(system).toContain("3 lượt");
    expect(user).toContain("Chủ quán cafe");
    expect(user).toContain("2026-11-19");
    expect(user).toContain("13-18°C");
    expect(user).toContain("Ngày Nhà giáo");
    expect(user).toContain("I1 (ảnh)");
    expect(user).toContain("Bài cũ về mica");
  });

  it("thiếu dữ liệu thì có câu thay thế", () => {
    const { user } = buildPlanPrompt({
      now: "x", days: ["2026-11-19"], postsPerDay: 2, groupName: "N", insight: "", workshopName: "X", location: "HN",
      weather: [], holidays: [], recentPosts: [], recentGroupMessages: [], materials: "", media: [], knowledge: "",
    });
    expect(user).toContain("chưa có mô tả");
    expect(user).toContain("không có, hãy dựa vào mùa");
    expect(user).toContain("chỉ dùng TEXT");
  });
});
