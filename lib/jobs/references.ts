import "server-only";
import { db } from "@/lib/db";
import { prepareLogoForAi } from "@/lib/imaging/logo-for-ai";
import { REFERENCE_TAG_VERSION, tagReference } from "@/lib/imaging/reference-tag";
import { getProvider } from "@/lib/providers";
import { getPublicUrl, getStorage, usesPublicStorage } from "@/lib/storage";
import { logoAiKey, refTagKey } from "@/lib/storage/keys";
import { once, shared } from "./throttle";

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
  // Kho công khai (R2): đưa thẳng địa chỉ công khai cho nhà cung cấp, không upload lên kho của họ nữa.
  // Bản logo gửi AI (nền tương phản) được tạo một lần, lưu cạnh bản chuẩn hóa; key suy ra từ key bản chuẩn hóa nên không cần cột CSDL riêng.
  if (usesPublicStorage()) {
    const aiKey = logoAiKey(logo.normalizedPath);
    return once(`logo:${aiKey}`, async () => {
      const storage = getStorage();
      if (!(await storage.exists(aiKey))) {
        const { buffer } = await prepareLogoForAi(await storage.get(logo.normalizedPath));
        await storage.put(aiKey, buffer, { contentType: "image/png" });
      }
      return getPublicUrl(aiKey);
    });
  }

  const provider = getProvider();
  // "-v2-" là phiên bản chuẩn bị logo cho AI (nền tương phản). URL đệm của bản cũ (nền trong suốt) bị bỏ, tải lại bản mới.
  if (provider.cacheReferences && stillValid(logo.kieUrl, logo.kieExpiresAt) && logo.kieUrl.includes(LOGO_VERSION_TAG)) {
    return logo.kieUrl;
  }

  // nhiều ảnh cùng phiên cần logo này cùng lúc: chỉ upload một lần, số upload cùng lúc toàn hệ thống cũng bị giới hạn
  return once(`logo:${logo.id}`, () =>
    shared().uploadLimit(async () => {
      const stored = await getStorage().get(logo.normalizedPath);
      const { buffer } = await prepareLogoForAi(stored);
      const up = await provider.uploadReference({ buffer, fileName: `logo-${logo.id}${LOGO_VERSION_TAG.slice(0, -1)}.png`, contentType: "image/png" });
      if (provider.cacheReferences) {
        await db.logo.update({ where: { id: logo.id }, data: { kieUrl: up.url, kieExpiresAt: up.expiresAt } });
      }
      return up.url;
    }),
  );
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
  // Kho công khai (R2): ảnh tham chiếu đã nằm sẵn trên kho, dùng thẳng địa chỉ công khai.
  if (usesPublicStorage()) return getPublicUrl(material.referencePath);
  const provider = getProvider();
  if (provider.cacheReferences && stillValid(material.kieRefUrl, material.kieRefExpiresAt)) {
    return material.kieRefUrl;
  }

  const referencePath = material.referencePath;
  // nhiều phiên cùng cần chất liệu này lúc chưa có link: chỉ upload một lần
  return once(`material:${material.id}`, () =>
    shared().uploadLimit(async () => {
      const buffer = await getStorage().get(referencePath);
      const up = await provider.uploadReference({
        buffer,
        fileName: `material-${material.id}.jpg`,
        contentType: "image/jpeg",
      });
      if (provider.cacheReferences) {
        await db.material.update({ where: { id: material.id }, data: { kieRefUrl: up.url, kieRefExpiresAt: up.expiresAt } });
      }
      return up.url;
    }),
  );
}

/**
 * URL ảnh tham chiếu của một chất liệu ĐÃ GẮN dải nhãn cho đúng ô `cell` (số ô trong prompt) và kiểu hàng (D123).
 * Kho công khai (R2): bản gắn nhãn được tạo một lần, lưu cạnh ảnh gốc rồi dùng lại. Kho không công khai: gắn nhãn rồi
 * upload lên kho của nhà cung cấp mỗi lần (không lưu đệm vì đường dẫn đệm trong CSDL là của bản chưa gắn nhãn).
 */
export async function ensureTaggedMaterialUrl(
  material: { id: string; code: string; referencePath: string | null },
  cell: number,
  kind: "ENGRAVE" | "CUT",
): Promise<string> {
  if (!material.referencePath) throw new NoReferenceError(material.code);
  const referencePath = material.referencePath;
  const key = refTagKey(referencePath, cell, kind, REFERENCE_TAG_VERSION);

  if (usesPublicStorage()) {
    return once(`reftag:${key}`, async () => {
      const storage = getStorage();
      if (!(await storage.exists(key))) {
        await storage.put(key, await tagReference(await storage.get(referencePath), { cell, kind }), { contentType: "image/jpeg" });
      }
      return getPublicUrl(key);
    });
  }

  const provider = getProvider();
  return shared().uploadLimit(async () => {
    const buffer = await tagReference(await getStorage().get(referencePath), { cell, kind });
    const up = await provider.uploadReference({ buffer, fileName: `material-${material.id}-c${cell}.jpg`, contentType: "image/jpeg" });
    return up.url;
  });
}

/** Lỗi không thể tự khắc phục bằng cách thử lại (thiếu ảnh tham chiếu). */
export class NoReferenceError extends Error {
  constructor(public code: string) {
    super(`Chất liệu ${code} chưa có ảnh tham chiếu.`);
  }
}
