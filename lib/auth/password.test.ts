import { describe, expect, it } from "vitest";
import { passwordProblem } from "./password";

describe("passwordProblem", () => {
  it("chấp nhận mật khẩu từ 8 ký tự", () => {
    expect(passwordProblem("12345678")).toBeNull();
    expect(passwordProblem("mật khẩu xưởng 2026")).toBeNull();
  });

  it("từ chối mật khẩu ngắn", () => {
    expect(passwordProblem("1234567")).toMatch(/ít nhất 8/);
  });

  it("đếm giới hạn 72 theo byte: 72 chữ không dấu được, 72 chữ có dấu thì quá dài", () => {
    expect(passwordProblem("a".repeat(72))).toBeNull();
    expect(passwordProblem("a".repeat(73))).toMatch(/quá dài/);
    expect(passwordProblem("ệ".repeat(30))).toMatch(/quá dài/); // 30 chữ x 3 byte = 90 byte
  });

  it("từ chối mật khẩu toàn khoảng trắng", () => {
    expect(passwordProblem("        ")).toMatch(/khoảng trắng/);
  });
});
