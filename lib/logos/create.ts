import "server-only";
import { db } from "@/lib/db";
import { normalizeLogo, type NormalizedLogo } from "@/lib/imaging/normalize-logo";
import { getStorage } from "@/lib/storage";

export class LogoError extends Error {
  constructor(
    message: string,
    /** true = lỗi do file logo (khách/nhân viên sửa được), false = lỗi hệ thống */
    public readonly userFault: boolean,
  ) {
    super(message);
  }
}

/**
 * Chuẩn hóa và lưu một logo vào thương hiệu. Dùng chung cho tải lên từ web và cho bot Zalo.
 * Không kiểm tra quyền: nơi gọi phải kiểm tra trước. Lỗi lưu thì dọn sạch file và dòng đã tạo.
 */
export async function createLogoFromBuffer(input: {
  userId: string;
  brandId: string;
  file: Buffer;
  note?: string | null;
}): Promise<{ logo: { id: string; normalizedPath: string; note: string | null }; normalized: NormalizedLogo }> {
  let normalized: NormalizedLogo;
  try {
    normalized = await normalizeLogo(input.file);
  } catch (e) {
    throw new LogoError(e instanceof Error ? e.message : "Không xử lý được logo.", true);
  }

  const storage = getStorage();
  const logo = await db.logo.create({
    data: {
      brandId: input.brandId,
      note: input.note || null,
      originalPath: "pending",
      normalizedPath: "pending",
      width: normalized.width,
      height: normalized.height,
      createdById: input.userId,
    },
  });

  const originalKey = `logos/${logo.id}/original.${normalized.originalExt}`;
  const normalizedKey = `logos/${logo.id}/normalized.png`;
  try {
    await storage.put(originalKey, input.file);
    await storage.put(normalizedKey, normalized.png);
    await db.logo.update({ where: { id: logo.id }, data: { originalPath: originalKey, normalizedPath: normalizedKey } });
  } catch (e) {
    console.error("upload logo lỗi:", e);
    await Promise.all([storage.delete(originalKey), storage.delete(normalizedKey)]).catch(() => {});
    await db.logo.delete({ where: { id: logo.id } }).catch(() => {});
    throw new LogoError("Không lưu được logo. Vui lòng thử lại.", false);
  }
  return { logo: { id: logo.id, normalizedPath: normalizedKey, note: logo.note }, normalized };
}
