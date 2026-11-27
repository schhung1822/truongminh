import "server-only";
import { getEnv, getR2Config } from "@/lib/env";
import { isPublicKey } from "./keys";
import { LocalStorage } from "./local";
import { R2Storage } from "./r2";
import { withoutDelete, type StorageDriver } from "./types";

let instance: StorageDriver | undefined;

/**
 * Kho ảnh theo cấu hình STORAGE_DRIVER: "r2" (Cloudflare R2) hoặc "local" (thư mục trên máy chủ).
 * Đọc ảnh phía máy chủ (để xử lý, gửi Zalo, xuất ZIP/PDF) luôn đi qua đây, kể cả khi bucket công khai.
 */
export function getStorage(): StorageDriver {
  if (instance) return instance;
  const env = getEnv();
  if (env.STORAGE_DRIVER === "r2") {
    const r2 = getR2Config(env);
    if (!r2) throw new Error('STORAGE_DRIVER="r2" nhưng chưa cấu hình đủ R2_* trong .env');
    instance = new R2Storage(r2);
  } else {
    instance = new LocalStorage(env.STORAGE_DIR);
  }
  if (env.STORAGE_NEVER_DELETE) instance = withoutDelete(instance);
  return instance;
}

/** true = ảnh đang nằm trên R2 (đưa được địa chỉ công khai cho trình duyệt và kie.ai). */
export function usesPublicStorage(): boolean {
  return getEnv().STORAGE_DRIVER === "r2";
}

const encodeKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");

/**
 * Địa chỉ công khai của một key, ghép từ R2_PUBLIC_URL lúc hiển thị (CSDL chỉ lưu key).
 * Đổi sang tên miền riêng chỉ cần sửa R2_PUBLIC_URL trong .env.
 */
export function getPublicUrl(key: string): string {
  const r2 = getR2Config();
  if (!r2) throw new Error("Chưa cấu hình R2_PUBLIC_URL nên không có địa chỉ công khai.");
  return `${r2.publicUrl}/${encodeKey(key)}`;
}

/** Tải một file lên kho. Trả về key và địa chỉ công khai (null khi key không công khai hoặc đang dùng kho local). */
export async function uploadFile(input: { key: string; body: Buffer; contentType?: string }): Promise<{ key: string; url: string | null }> {
  await getStorage().put(input.key, input.body, { contentType: input.contentType });
  return { key: input.key, url: usesPublicStorage() && isPublicKey(input.key) ? getPublicUrl(input.key) : null };
}

/** Xóa một file khỏi kho (không báo lỗi nếu không có). */
export async function deleteFile(key: string): Promise<void> {
  await getStorage().delete(key);
}

/**
 * Địa chỉ để trình duyệt xem ảnh. Ảnh công khai (chất liệu, mockup, logo) trên R2 đi thẳng địa chỉ R2;
 * còn lại (ảnh khách gửi qua Zalo, tư liệu chăm sóc) và kho local đi qua /api/files có kiểm tra đăng nhập.
 */
export function fileUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (usesPublicStorage() && isPublicKey(key)) return getPublicUrl(key);
  return `/api/files/${encodeKey(key)}`;
}
