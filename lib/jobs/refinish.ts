import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { LabelPos, LabelStyle } from "@/lib/imaging/label-pos";
import { getStorage } from "@/lib/storage";
import { mockupKey, thumbKey } from "@/lib/storage/keys";
import { mapLimit } from "./async";
import { renderFinal } from "./finish";

/**
 * Vẽ lại ảnh hoàn thiện của các ảnh ĐÃ XONG trong một phiên từ ảnh gốc AI đang lưu, theo giao diện và cấu hình hiện tại
 * (đầu trang, nhãn chất liệu, chân trang). KHÔNG gọi AI nên không tốn token. Trả về số ảnh đã vẽ lại.
 */
export async function refinishSession(
  sessionId: string,
  opts: { imageId?: string; labelPos?: LabelPos; labelStyle?: LabelStyle } = {},
): Promise<number> {
  const images = await db.generatedImage.findMany({
    where: {
      sessionId,
      status: "SUCCESS",
      originalPath: { not: null },
      retries: { none: {} },
      ...(opts.imageId ? { id: opts.imageId } : {}),
    },
    include: { session: { include: { logo: { include: { brand: true } } } } },
  });
  const storage = getStorage();
  let done = 0;

  await mapLimit(images, 3, async (img) => {
    try {
      const original = await storage.get(img.originalPath!);
      // đổi kiểu hoặc vị trí nhãn: ghi vào bản chụp của ảnh để các lần vẽ lại và tạo lại sau này vẫn giữ
      const changed = !!(opts.labelPos || opts.labelStyle);
      const snapshot = changed
        ? {
            ...(img.layoutSnapshot as object),
            ...(opts.labelPos ? { labelPos: opts.labelPos } : {}),
            ...(opts.labelStyle ? { labelStyle: opts.labelStyle } : {}),
          }
        : img.layoutSnapshot;
      const final = await renderFinal({ ...img, layoutSnapshot: snapshot }, img.session.logo.brand.name, original);
      // key mới mỗi lần (ngẫu nhiên) để trình duyệt không dùng lại ảnh cũ đã lưu đệm
      const key = mockupKey(img.session.logo.brandId);
      await storage.put(key, final, { contentType: "image/webp" });
      await db.generatedImage.update({
        where: { id: img.id },
        data: { finalPath: key, ...(changed ? { layoutSnapshot: snapshot as Prisma.InputJsonValue } : {}) },
      });
      if (img.finalPath && img.finalPath !== key) {
        await storage.delete(img.finalPath).catch(() => {});
        await storage.delete(thumbKey(img.finalPath)).catch(() => {}); // ảnh thu nhỏ cũ
      }
      done++;
    } catch (e) {
      console.error(`refinish ${img.id} lỗi:`, e instanceof Error ? e.message : e);
    }
  });
  return done;
}
