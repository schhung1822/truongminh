import { describe, expect, it } from "vitest";
import { sameSecret } from "./webhook-auth";

describe("sameSecret", () => {
  it("khớp khi hai chuỗi giống hệt", () => {
    expect(sameSecret("abcdefgh12345678", "abcdefgh12345678")).toBe(true);
  });

  it("sai khi khác nội dung hoặc khác độ dài", () => {
    expect(sameSecret("abcdefgh12345678", "abcdefgh12345679")).toBe(false);
    expect(sameSecret("abcdefgh", "abcdefgh12345678")).toBe(false);
  });

  it("thiếu một trong hai bên thì luôn sai (kể cả khi cả hai cùng rỗng)", () => {
    expect(sameSecret(null, "abcdefgh12345678")).toBe(false);
    expect(sameSecret("abcdefgh12345678", undefined)).toBe(false);
    expect(sameSecret("", "")).toBe(false);
  });
});
