import "server-only";
import { db } from "@/lib/db";
import { prepareLogoForAi } from "@/lib/imaging/logo-for-ai";
import { getProvider } from "@/lib/providers";
import { getStorage } from "@/lib/storage";

/** Hậu tố có trong tên file logo đã chuẩn bị cho AI. Đổi số khi thay cách chuẩn bị logo để buộc tải lại. */
const LOGO_VERSION_TAG = "-v2-";

// Chỉ dùng lại URL đã upload nếu còn hạn ít nhất ngần này
const MIN_REMAINING_MS = 60 * 60 * 1000;

function stillValid(url: string | null, expiresAt: Date | null): url is string {
  if (!url) return false;
  return !expiresAt || expiresAt.getTime() - Date.now() > MIN_REMAINING_MS;
}

/** URL ảnh logo (đã chuẩn hóa) trên nhà cung cấp; dùng bộ nhớ đệm nếu nhà cung cấp cho phép. */
export async function ensureLogoUrl(logo: {
  id: string;
  normalizedPath: string;
  kieUrl: string | null;
  kieExpiresAt: Date | null;
}): Promise<string> {
  const provider = getProvider();
  // "-v2-" là phiên bản chuẩn bị logo cho AI (nền tương phản). URL đệm của bản cũ (nền trong suốt) bị bỏ, tải lại bản mới.
  if (provider.cacheReferences && stillValid(logo.kieUrl, logo.kieExpiresAt) && logo.kieUrl.includes(LOGO_VERSION_TAG)) {
    return logo.kieUrl;
  }

  const stored = await getStorage().get(logo.normalizedPath);
  const { buffer } = await prepareLogoForAi(stored);
  const up = await provider.uploadReference({ buffer, fileName: `logo-${logo.id}${LOGO_VERSION_TAG.slice(0, -1)}.png`, contentType: "image/png" });
  if (provider.cacheReferences) {
    await db.logo.update({ where: { id: logo.id }, data: { kieUrl: up.url, kieExpiresAt: up.expiresAt } });
  }
  return up.url;
}

/** URL ảnh tham chiếu (ghép lớp 1 + lớp 2) của một chất liệu. */
export async function ensureMaterialUrl(material: {
  id: string;
  code: string;
  referencePath: string | null;
  kieRefUrl: string | null;
  kieRefExpiresAt: Date | null;
}): Promise<string> {
  if (!material.referencePath) throw new NoReferenceError(material.code);
  const provider = getProvider();
  if (provider.cacheReferences && stillValid(material.kieRefUrl, material.kieRefExpiresAt)) {
    return material.kieRefUrl;
  }

  const buffer = await getStorage().get(material.referencePath);
  const up = await provider.uploadReference({
    buffer,
    fileName: `material-${material.id}.jpg`,
    contentType: "image/jpeg",
  });
  if (provider.cacheReferences) {
    await db.material.update({ where: { id: material.id }, data: { kieRefUrl: up.url, kieRefExpiresAt: up.expiresAt } });
  }
  return up.url;
}

/** Lỗi không thể tự khắc phục bằng cách thử lại (thiếu ảnh tham chiếu). */
export class NoReferenceError extends Error {
  constructor(public code: string) {
    super(`Chất liệu ${code} chưa có ảnh tham chiếu.`);
  }
}
