import { promises as fs } from "node:fs";
import path from "node:path";
import type { StorageDriver } from "./types";

/** Chuẩn hóa và kiểm tra key, chặn thoát ra ngoài thư mục gốc (path traversal). */
export function sanitizeKey(key: string): string {
  if (!key || key.includes("\0") || key.includes("\\") || key.startsWith("/")) {
    throw new Error("Đường dẫn file không hợp lệ.");
  }
  const parts = key.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) {
    throw new Error("Đường dẫn file không hợp lệ.");
  }
  return parts.join("/");
}

export class LocalStorage implements StorageDriver {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    const safe = sanitizeKey(key);
    const full = path.join(this.root, ...safe.split("/"));
    if (!full.startsWith(this.root + path.sep)) {
      throw new Error("Đường dẫn file không hợp lệ.");
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}
