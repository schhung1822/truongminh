import { apiUser, isResponse, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { buildPdf, buildZip } from "@/lib/export/build";
import { compareSessionImages } from "@/lib/jobs/order";
import type { LayoutSnapshot } from "@/lib/jobs/snapshot";
import { getStorage } from "@/lib/storage";
import { toJpeg } from "@/lib/imaging/webp";

function contentDisposition(name: string): string {
  const ascii = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9._-]+/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Tải mọi ảnh đã xong của một phiên: ?format=zip (mỗi ảnh một file) hoặc ?format=pdf (mỗi trang một ảnh). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (isResponse(user)) return user;

  const { id } = await ctx.params;
  const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "zip";

  const session = await db.consultSession.findUnique({
    where: { id },
    include: { logo: { include: { brand: true } } },
  });
  if (!session) return jsonError(404, "Không tìm thấy phiên.");

  const images = await db.generatedImage.findMany({
    where: { sessionId: id, status: "SUCCESS", finalPath: { not: null }, retries: { none: {} } },
    select: {
      id: true,
      finalPath: true,
      layoutSnapshot: true,
      materialId: true,
      variantIndex: true,
      createdAt: true,
      sheet: { select: { sortOrder: true } },
    },
  });
  if (images.length === 0) return jsonError(404, "Phiên này chưa có ảnh nào hoàn thành để tải.");
  images.sort(compareSessionImages);

  const storage = getStorage();
  const brand = session.logo.brand.name;
  const files = await Promise.all(
    images.map(async (img, i) => {
      const snap = img.layoutSnapshot as unknown as LayoutSnapshot;
      return { name: `${brand} - Ảnh ${snap.imageNumber ?? i + 1}.jpg`, data: await toJpeg(await storage.get(img.finalPath!)) }; // ZIP/PDF cần JPEG
    }),
  );

  const body = format === "pdf" ? await buildPdf(files.map((f) => f.data), brand) : buildZip(files);
  const downloadName = `${brand} - ${images.length} ảnh.${format}`.replace(/[\\/:*?"<>|]+/g, " ");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/zip",
      "Content-Disposition": contentDisposition(downloadName),
      "Cache-Control": "private, no-store",
    },
  });
}
