import { describe, expect, it } from "vitest";
import { ISSUE_KINDS, issueKindInfo, summarizeIssues } from "./issue-kinds";

describe("ISSUE_KINDS", () => {
  it("mã loại vừa cột kind (30 ký tự), loại nào cũng có nhãn và lời khuyên", () => {
    for (const [kind, info] of Object.entries(ISSUE_KINDS)) {
      expect(kind.length).toBeLessThanOrEqual(30);
      expect(info.label.length).toBeGreaterThan(5);
      expect(info.advice.length).toBeGreaterThan(10);
    }
  });

  it("lần AI lệch mà trợ lý tự nhắc lại được thì không tính là người ra lệnh thấy lỗi", () => {
    expect([ISSUE_KINDS.BAD_FORMAT.visible, ISSUE_KINDS.DODGE.visible, ISSUE_KINDS.BAD_ARGS.visible]).toEqual([false, false, false]);
    expect([ISSUE_KINDS.CRASH.visible, ISSUE_KINDS.NOT_UNDERSTOOD.visible, ISSUE_KINDS.DODGE_FALLBACK.visible, ISSUE_KINDS.SEND_FAILED.visible]).toEqual([true, true, true, true]);
  });
});

describe("issueKindInfo", () => {
  it("loại lạ (dòng do bản khác ghi) vẫn hiện được bằng chính mã của nó", () => {
    expect(issueKindInfo("CRASH").label).toBe(ISSUE_KINDS.CRASH.label);
    expect(issueKindInfo("LOAI_MOI")).toEqual({ label: "LOAI_MOI", visible: true, advice: "" });
  });
});

describe("summarizeIssues", () => {
  it("loại người ra lệnh thấy đứng trước, trong mỗi nhóm xếp theo số lần giảm dần, bỏ loại không có lần nào", () => {
    const out = summarizeIssues([
      { kind: "BAD_FORMAT", count: 9 },
      { kind: "AI_UNREACHABLE", count: 2 },
      { kind: "CRASH", count: 5 },
      { kind: "DODGE", count: 1 },
      { kind: "TOO_LONG", count: 0 },
    ]);
    expect(out.map((k) => [k.kind, k.count, k.visible])).toEqual([
      ["CRASH", 5, true],
      ["AI_UNREACHABLE", 2, true],
      ["BAD_FORMAT", 9, false],
      ["DODGE", 1, false],
    ]);
    expect(out[0].label).toBe(ISSUE_KINDS.CRASH.label);
  });
});
