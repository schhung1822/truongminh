import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, loadSecretKey } from "./secret-box";

describe("secret-box", () => {
  const key = loadSecretKey({ envKey: "khoa-thu-nghiem-0123456789" });

  it("mã hóa rồi giải mã ra đúng nội dung (kể cả tiếng Việt), mỗi lần mã hóa ra chuỗi khác nhau", () => {
    const text = JSON.stringify({ cookie: "abc=1; xyz=Tiếng Việt", imei: "123" });
    const a = encryptSecret(text, key);
    const b = encryptSecret(text, key);
    expect(a.startsWith("v1:")).toBe(true);
    expect(a).not.toBe(b);
    expect(a).not.toContain("abc=1");
    expect(decryptSecret(a, key)).toBe(text);
  });

  it("sai khóa hoặc dữ liệu bị sửa thì báo lỗi rõ ràng", () => {
    const boxed = encryptSecret("bí mật", key);
    const other = loadSecretKey({ envKey: "mot-khoa-khac-hoan-toan-0123" });
    expect(() => decryptSecret(boxed, other)).toThrow(/giải mã/);
    const tampered = boxed.slice(0, -2) + (boxed.endsWith("A") ? "B" : "A") + boxed.slice(-1);
    expect(() => decryptSecret(tampered, key)).toThrow(/giải mã/);
    expect(() => decryptSecret("khong-phai-v1", key)).toThrow(/định dạng/);
  });

  it("không có khóa trong .env thì tự sinh file khóa và lần sau dùng lại đúng khóa đó", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tm-key-"));
    const k1 = loadSecretKey({ envKey: "", dir });
    const file = readFileSync(path.join(dir, ".secret-key"), "utf8");
    expect(file.length).toBeGreaterThanOrEqual(32);
    const boxed = encryptSecret("xin chào", k1);
    const k2 = loadSecretKey({ envKey: "", dir });
    expect(decryptSecret(boxed, k2)).toBe("xin chào");
  });
});
