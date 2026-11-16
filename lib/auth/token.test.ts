import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "./token";

describe("token", () => {
  it("sinh token khác nhau mỗi lần và đủ dài", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
  });

  it("băm ổn định, 64 ký tự hex, không trùng token gốc", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toBe(t);
  });
});
