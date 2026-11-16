import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeSignature, isValidSignature } from "./kie-webhook";

describe("chữ ký webhook kie.ai", () => {
  const secret = "khoa-bi-mat";

  it("đúng công thức base64(HMAC-SHA256(taskId.timestamp))", () => {
    const expected = createHmac("sha256", secret).update("task_1.1700000000").digest("base64");
    expect(computeSignature("task_1", "1700000000", secret)).toBe(expected);
  });

  it("chấp nhận chữ ký đúng", () => {
    const sig = computeSignature("task_1", "1700000000", secret);
    expect(isValidSignature("task_1", "1700000000", sig, secret)).toBe(true);
  });

  it("từ chối khi sai taskId, sai thời gian, sai khóa hoặc chữ ký giả", () => {
    const sig = computeSignature("task_1", "1700000000", secret);
    expect(isValidSignature("task_2", "1700000000", sig, secret)).toBe(false);
    expect(isValidSignature("task_1", "1700000001", sig, secret)).toBe(false);
    expect(isValidSignature("task_1", "1700000000", sig, "khoa-khac")).toBe(false);
    expect(isValidSignature("task_1", "1700000000", "gia", secret)).toBe(false);
    expect(isValidSignature("task_1", "1700000000", "", secret)).toBe(false);
  });
});
