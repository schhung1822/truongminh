import "server-only";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { mapLimit } from "./async";
import { renderFinal } from "./finish";

/**
 * Vẽ lại ảnh hoàn thiện của các ảnh ĐÃ XONG trong một phiên từ ảnh gốc AI đang lưu, theo giao diện và cấu hình hiện tại
 * (đầu trang, nhãn chất liệu, chân trang). KHÔNG gọi AI nên không tốn token. Trả về số ảnh đã vẽ lại.
 */
export async function refinishSession(sessionId: string): Promise<number> {
  const images = await db.generatedImage.findMany({
    where: { sessionId, status: "SUCCESS", originalPath: { not: null }, retries: { none: {} } },
    include: { session: { include: { logo: { include: { brand: true } } } } },
  });
  const storage = getStorage();
  let done = 0;

  await mapLimit(images, 3, async (img) => {
    try {
      const original = await storage.get(img.originalPath!);
      const final = await renderFinal(img, img.session.logo.brand.name, original);
      // tên file mới mỗi lần để trình duyệt không dùng lại ảnh cũ đã lưu đệm
      const key = `images/${img.sessionId}/${img.id}-final-${Date.now().toString(36)}.jpg`;
      await storage.put(key, final);
      await db.generatedImage.update({ where: { id: img.id }, data: { finalPath: key } });
      if (img.finalPath && img.finalPath !== key) await storage.delete(img.finalPath).catch(() => {});
      done++;
    } catch (e) {
      console.error(`refinish ${img.id} lỗi:`, e instanceof Error ? e.message : e);
    }
  });
  return done;
}
