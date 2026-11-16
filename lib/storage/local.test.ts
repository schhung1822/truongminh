import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalStorage, sanitizeKey } from "./local";

describe("sanitizeKey", () => {
  it("chấp nhận key bình thường", () => {
    expect(sanitizeKey("materials/abc/layer1.jpg")).toBe("materials/abc/layer1.jpg");
  });

  it("chặn đường dẫn nguy hiểm", () => {
    for (const bad of ["../x", "a/../b", "/abs", "a//b", "a\\b", "", "a/./b", "a\0b"]) {
      expect(() => sanitizeKey(bad), bad).toThrow();
    }
  });
});

describe("LocalStorage", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "storage-test-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const storage = new LocalStorage(dir);

  it("ghi, đọc, kiểm tra tồn tại và xóa", async () => {
    await storage.put("a/b/c.txt", Buffer.from("xin chào"));
    expect(await storage.exists("a/b/c.txt")).toBe(true);
    expect((await storage.get("a/b/c.txt")).toString("utf8")).toBe("xin chào");
    await storage.delete("a/b/c.txt");
    expect(await storage.exists("a/b/c.txt")).toBe(false);
    await storage.delete("a/b/khong-co.txt"); // không báo lỗi
  });

  it("không cho thoát ra ngoài thư mục gốc", async () => {
    await expect(storage.put("../ngoai.txt", Buffer.from("x"))).rejects.toThrow();
  });
});
