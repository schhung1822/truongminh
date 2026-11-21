import "server-only";
import { db } from "@/lib/db";
import { finishImage } from "@/lib/imaging/finish-image";
import { getSettings } from "@/lib/settings";
import { compareSessionImages } from "./order";
import type { LayoutSnapshot } from "./snapshot";

/** Số thứ tự ảnh trong phiên (1, 2, 3...) theo đúng thứ tự hiển thị; dùng cho ảnh cũ chưa lưu số thứ tự. */
export async function fallbackImageNumber(sessionId: string, imageId: string): Promise<number | undefined> {
  const images = await db.generatedImage.findMany({
    where: { sessionId, retries: { none: {} } },
    select: { id: true, materialId: true, variantIndex: true, createdAt: true, sheet: { select: { sortOrder: true } } },
  });
  images.sort(compareSessionImages);
  const i = images.findIndex((x) => x.id === imageId);
  return i >= 0 ? i + 1 : undefined;
}

/**
 * Vẽ ảnh hoàn thiện (đầu trang, nhãn, chân trang) từ ảnh gốc AI theo cấu hình hiện tại.
 * Dùng khi ảnh vừa tạo xong và khi vẽ lại ảnh cũ theo giao diện mới (không gọi AI, không tốn token).
 */
export async function renderFinal(
  img: { id: string; sessionId: string; layoutSnapshot: unknown },
  brandName: string,
  original: Buffer,
): Promise<Buffer> {
  const snapshot = img.layoutSnapshot as LayoutSnapshot;
  const settings = await getSettings();

  // Bản chụp cũ chưa có loại chất liệu / công nghệ in: lấy từ chất liệu hiện tại
  let cells = snapshot.cells;
  if (cells.some((c) => c.groupName === undefined && c.printTech === undefined)) {
    const mats = await db.material.findMany({
      where: { id: { in: cells.map((c) => c.materialId) } },
      select: { id: true, groupName: true, printTech: true },
    });
    const byId = new Map(mats.map((m) => [m.id, m]));
    cells = cells.map((c) => ({ ...c, groupName: c.groupName ?? byId.get(c.materialId)?.groupName, printTech: c.printTech ?? byId.get(c.materialId)?.printTech }));
  }

  const number = snapshot.imageNumber ?? (await fallbackImageNumber(img.sessionId, img.id));
  return finishImage({
    original,
    brandName,
    imageLabel: number ? `Ảnh ${number}` : undefined,
    cols: snapshot.cols,
    rows: snapshot.rows,
    cells,
    labelMode: snapshot.labelStyle ?? settings.labelMode,
    labelPos: snapshot.labelPos ?? settings.labelPos,
    workshopName: settings.workshopName,
    footerNote: settings.footerNote,
    footerDisclaimer: settings.footerDisclaimer,
    format: "webp", // ảnh lưu trên kho là WebP; nơi cần JPEG (tải về, ZIP, PDF, Zalo) tự đổi bằng toJpeg
  });
}
