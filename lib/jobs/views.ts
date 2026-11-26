import "server-only";
import type { SessionUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { canEditOwned } from "@/lib/permissions";
import { fileUrl } from "@/lib/storage";
import { hintForError } from "./error-hint";
import { compareSessionImages } from "./order";
import { expectedDurationMs } from "./progress";
import type { LayoutSnapshot } from "./snapshot";
import type { ImageView } from "./view";

/** Danh sách ảnh của một phiên để hiển thị: mỗi "chỗ" chỉ lấy bản mới nhất (bỏ các bản đã được tạo lại). */
export async function loadSessionViews(sessionId: string, user: SessionUser): Promise<ImageView[]> {
  const images = await db.generatedImage.findMany({
    where: { sessionId, retries: { none: {} } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { sheet: { select: { sortOrder: true } } },
  });

  // Thứ tự ổn định: ảnh được tạo lại không nhảy xuống cuối danh sách
  images.sort(compareSessionImages);

  return images.map((img) => {
    const snapshot = img.layoutSnapshot as unknown as LayoutSnapshot;
    const label =
      img.kind === "DESIGN" && snapshot.design ? `${snapshot.title} · ${snapshot.design.styleName}` : snapshot.title;
    return {
      id: img.id,
      kind: img.kind,
      status: img.status,
      label,
      finalUrl: img.status === "SUCCESS" ? fileUrl(img.finalPath) : null,
      downloadUrl: img.status === "SUCCESS" ? `/api/images/${img.id}/download` : null,
      errorDetail: user.role === "ADMIN" ? img.errorMessage : null,
      errorHint: img.status === "FAILED" ? hintForError(img.errorMessage) : null,
      attempt: img.attempt,
      ageMs: Date.now() - img.createdAt.getTime(),
      expectedMs: expectedDurationMs(img.resolution),
      materialId: img.materialId,
      canRetry: (img.status === "SUCCESS" || img.status === "FAILED") && canEditOwned(user, img.createdById),
      labelPos: snapshot.labelPos ?? null,
      labelStyle: snapshot.labelStyle ?? null,
      pick:
        img.kind === "SHEET"
          ? {
              cols: snapshot.cols,
              rows: snapshot.rows,
              aspectRatio: img.aspectRatio,
              cells: snapshot.cells.map((c, i) => ({ number: i + 1, materialId: c.materialId, code: c.code, name: c.name })),
            }
          : null,
      quality: snapshot.quality === true,
    };
  });
}
