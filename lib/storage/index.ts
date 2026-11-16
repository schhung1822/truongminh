import "server-only";
import { getEnv } from "@/lib/env";
import { LocalStorage } from "./local";
import type { StorageDriver } from "./types";

let instance: StorageDriver | undefined;

export function getStorage(): StorageDriver {
  if (instance) return instance;
  const env = getEnv();
  // Hiện chỉ có "local". Thêm "s3" ở đây khi cần.
  instance = new LocalStorage(env.STORAGE_DIR);
  return instance;
}

/** Đường dẫn để trình duyệt xem ảnh (có kiểm tra đăng nhập). */
export function fileUrl(key: string | null | undefined): string | null {
  return key ? `/api/files/${key.split("/").map(encodeURIComponent).join("/")}` : null;
}
