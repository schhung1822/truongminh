import { describe, expect, it } from "vitest";
import { EXT_TOKEN_PREFIX, generateExtToken, hashExtToken, parseBearer } from "./token";

describe("generateExtToken", () => {
  it("mã có tiền tố tmx_, đủ dài, mỗi lần một mã khác", () => {
    const a = generateExtToken();
    const b = generateExtToken();
    expect(a.token.startsWith(EXT_TOKEN_PREFIX)).toBe(true);
    expect(a.token.length).toBe(47);
    expect(a.token).not.toBe(b.token);
  });

  it("chỉ lưu băm sha256 (64 ký tự hex), không chứa mã gốc", () => {
    const { token, hash } = generateExtToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashExtToken(token)).toBe(hash);
  });

  it("phần tiền tố lưu lại chỉ là vài ký tự đầu, không đủ để dùng", () => {
    const { token, prefix } = generateExtToken();
    expect(prefix).toBe(token.slice(0, 8));
    expect(prefix.length).toBeLessThan(token.length / 4);
  });
});

describe("parseBearer", () => {
  const { token } = generateExtToken();

  it("lấy mã từ header đúng dạng, không phân biệt hoa thường của chữ Bearer", () => {
    expect(parseBearer(`Bearer ${token}`)).toBe(token);
    expect(parseBearer(`bearer ${token}`)).toBe(token);
    expect(parseBearer(`Bearer   ${token}  `)).toBe(token);
  });

  it("sai dạng thì null", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("")).toBeNull();
    expect(parseBearer(token)).toBeNull(); // thiếu chữ Bearer
    expect(parseBearer(`Basic ${token}`)).toBeNull();
    expect(parseBearer("Bearer abc")).toBeNull(); // sai tiền tố và độ dài
    expect(parseBearer(`Bearer ${token}x`)).toBeNull(); // dài hơn
    expect(parseBearer(`Bearer ${token.slice(0, -1)}`)).toBeNull(); // ngắn hơn
    expect(parseBearer(`Bearer tmx_${"!".repeat(43)}`)).toBeNull(); // ký tự lạ
  });
});
