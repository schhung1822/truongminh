/** Đọc file nguồn từ thư mục local (STORAGE_DIR cũ). Chỉ ĐỌC, không ghi, không tạo file. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { sanitizeKey } from "../lib/storage/local";

const MISSING_CODES = new Set(["ENOENT", "ENOTDIR"]);

export function createFsSource(root: string) {
  const base = path.resolve(root);
  const resolve = (key: string): string => {
    const full = path.join(base, ...sanitizeKey(key).split("/"));
    if (!full.startsWith(base + path.sep)) throw new Error("Đường dẫn file không hợp lệ.");
    return full;
  };
  const isMissing = (e: unknown) => MISSING_CODES.has((e as NodeJS.ErrnoException).code ?? "");

  return {
    root: base,
    /** null = file không tồn tại (hoặc là thư mục). Lỗi khác (không có quyền đọc...) được ném ra. */
    async readSource(key: string): Promise<Buffer | null> {
      try {
        return await fs.readFile(resolve(key));
      } catch (e) {
        if (isMissing(e) || (e as NodeJS.ErrnoException).code === "EISDIR") return null;
        throw e;
      }
    },
    async statSource(key: string): Promise<{ size: number } | null> {
      try {
        const st = await fs.stat(resolve(key));
        return st.isFile() ? { size: st.size } : null;
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
    },
  };
}

async function walk(dir: string, visit: (file: string) => void): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, visit);
    else visit(e.name);
  }
}

/**
 * Đếm file phái sinh trong thư mục cũ mà script KHÔNG chuyển vì hệ thống tự tạo lại khi cần:
 * ảnh thu nhỏ cũ (images/**\/*-thumb.jpg) và bản logo gửi AI (logos/**\/*-ai*.png).
 */
export async function countDerivedFiles(root: string): Promise<{ thumbs: number; aiLogos: number }> {
  let thumbs = 0;
  let aiLogos = 0;
  await walk(path.join(root, "images"), (name) => {
    if (/-thumb\.jpg$/i.test(name)) thumbs++;
  });
  await walk(path.join(root, "logos"), (name) => {
    if (/-ai(?:-v\d+)?\.png$/i.test(name)) aiLogos++;
  });
  return { thumbs, aiLogos };
}
