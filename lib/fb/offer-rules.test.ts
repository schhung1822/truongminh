import { describe, expect, it } from "vitest";
import { inOfferCooldown, parseMaterialIds, resolveReplyIdentity, worthAiCheck } from "./offer-rules";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-28T03:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);

describe("resolveReplyIdentity (v1.1 mục 4.1.2 và 4.1.3)", () => {
  it("nhóm fanpage đã vào: trả lời dưới tên fanpage", () => {
    expect(resolveReplyIdentity({ hasDefaultPage: true, inGroup: true, pageJoined: true, fallback: "skip" })).toEqual({ replyAs: "PAGE" });
  });
  it("bài không thuộc nhóm nào: fanpage", () => {
    expect(resolveReplyIdentity({ hasDefaultPage: true, inGroup: false, pageJoined: false, fallback: "skip" })).toEqual({ replyAs: "PAGE" });
  });
  it("nhóm fanpage chưa vào: theo cấu hình, nick hoặc bỏ qua", () => {
    expect(resolveReplyIdentity({ hasDefaultPage: true, inGroup: true, pageJoined: false, fallback: "account" })).toEqual({ replyAs: "ACCOUNT" });
    expect(resolveReplyIdentity({ hasDefaultPage: true, inGroup: true, pageJoined: false, fallback: "skip" })).toBeNull();
  });
  it("chưa khai fanpage nào: coi như không dùng được fanpage", () => {
    expect(resolveReplyIdentity({ hasDefaultPage: false, inGroup: true, pageJoined: true, fallback: "account" })).toEqual({ replyAs: "ACCOUNT" });
    expect(resolveReplyIdentity({ hasDefaultPage: false, inGroup: false, pageJoined: false, fallback: "skip" })).toBeNull();
  });
});

describe("inOfferCooldown (chống chào lặp)", () => {
  it("đã gửi câu chào trong 30 ngày: không chào lại", () => {
    expect(inOfferCooldown({ lastOfferedAt: daysAgo(29), latestOfferQueuedAt: null, now, cooldownDays: 30 })).toBe(true);
    expect(inOfferCooldown({ lastOfferedAt: daysAgo(31), latestOfferQueuedAt: null, now, cooldownDays: 30 })).toBe(false);
  });
  it("câu chào đầu còn nằm trong hàng chờ (chưa gửi) cũng chặn câu thứ hai", () => {
    expect(inOfferCooldown({ lastOfferedAt: null, latestOfferQueuedAt: daysAgo(1), now, cooldownDays: 30 })).toBe(true);
  });
  it("chưa từng chào thì được chào; cooldown = 0 thì không chặn", () => {
    expect(inOfferCooldown({ lastOfferedAt: null, latestOfferQueuedAt: null, now, cooldownDays: 30 })).toBe(false);
    expect(inOfferCooldown({ lastOfferedAt: daysAgo(1), latestOfferQueuedAt: daysAgo(1), now, cooldownDays: 0 })).toBe(false);
  });
});

describe("parseMaterialIds", () => {
  it("chỉ nhận mảng chuỗi, bỏ trùng và giá trị lạ", () => {
    expect(parseMaterialIds(["a", "b", "a", 3, null, ""])).toEqual(["a", "b"]);
    expect(parseMaterialIds(null)).toEqual([]);
    expect(parseMaterialIds({ a: 1 })).toEqual([]);
    expect(parseMaterialIds("abc")).toEqual([]);
  });
  it("tối đa 12 vật liệu", () => {
    expect(parseMaterialIds(Array.from({ length: 30 }, (_, i) => `m${i}`))).toHaveLength(12);
  });
});

describe("worthAiCheck (comment không có liên hệ có đáng hỏi AI không)", () => {
  it("bỏ comment của mình, spam, và comment quá ngắn", () => {
    expect(worthAiCheck({ isOwn: true, category: "OTHER", text: "Xưởng em nhận may áo thun số lượng lớn" })).toBe(false);
    expect(worthAiCheck({ isOwn: false, category: "SPAM", text: "Xưởng em nhận may áo thun số lượng lớn" })).toBe(false);
    expect(worthAiCheck({ isOwn: false, category: "INTEREST", text: "ib" })).toBe(false);
    expect(worthAiCheck({ isOwn: false, category: "INTEREST", text: "  quan tâm  " })).toBe(false);
  });
  it("comment có nội dung thì hỏi", () => {
    expect(worthAiCheck({ isOwn: false, category: "OTHER", text: "Xưởng em nhận may áo thun, ib em nhé" })).toBe(true);
  });
});
