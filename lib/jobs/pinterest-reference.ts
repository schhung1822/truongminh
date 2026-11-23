import "server-only";
import type { PinterestPin } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/providers";
import { getPublicUrl, getStorage, usesPublicStorage } from "@/lib/storage";
import { pinterestKey } from "@/lib/storage/keys";
import { once, shared } from "./throttle";

// Chỉ dùng lại URL đã upload lên nhà cung cấp AI nếu còn hạn ít nhất ngần này (giống lib/jobs/references.ts).
const MIN_REMAINING_MS = 60 * 60 * 1000;

/** Ảnh phong cách đã chọn không còn trong thư viện; thử lại không thể tự sửa được. */
export class PinterestReferenceError extends Error {}

function stillValid(url: string | null, expiresAt: Date | null): url is string {
  if (!url) return false;
  return !expiresAt || expiresAt.getTime() - Date.now() > MIN_REMAINING_MS;
}

/**
 * URL ảnh của một pin Pinterest trên nhà cung cấp AI, để gửi kèm lúc tạo ảnh thiết kế (ảnh phong cách tham khảo).
 * Lần đầu dùng một pin: tải ảnh gốc từ Pinterest về kho của hệ thống (để không phụ thuộc Pinterest còn giữ ảnh hay
 * không), rồi mới đưa lên nhà cung cấp AI — cùng cách làm với ảnh chất liệu (xem lib/jobs/references.ts).
 */
export async function ensurePinterestPinUrl(pin: PinterestPin): Promise<string> {
  return once(`pinterest-pin:${pin.id}`, async () => {
    const localPath = pin.localPath ?? (await downloadToStorage(pin));

    if (usesPublicStorage()) return getPublicUrl(localPath);

    const provider = getProvider();
    if (provider.cacheReferences && stillValid(pin.kieRefUrl, pin.kieRefExpiresAt)) return pin.kieRefUrl;

    return shared().uploadLimit(async () => {
      const buffer = await getStorage().get(localPath);
      const up = await provider.uploadReference({ buffer, fileName: `pinterest-${pin.pinterestPinId}.jpg`, contentType: "image/jpeg" });
      if (provider.cacheReferences) {
        await db.pinterestPin.update({ where: { id: pin.id }, data: { kieRefUrl: up.url, kieRefExpiresAt: up.expiresAt } });
      }
      return up.url;
    });
  });
}

async function downloadToStorage(pin: PinterestPin): Promise<string> {
  const res = await fetch(pin.sourceImageUrl);
  if (!res.ok) throw new Error(`Không tải được ảnh Pinterest (mã ${res.status}).`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const key = pinterestKey(pin.pinterestPinId);
  await getStorage().put(key, buffer, { contentType: res.headers.get("content-type") ?? "image/jpeg" });
  await db.pinterestPin.update({ where: { id: pin.id }, data: { localPath: key } });
  return key;
}
