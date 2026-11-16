import "server-only";
import type { SessionUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { canEditOwned } from "@/lib/permissions";
import { fileUrl } from "@/lib/storage";
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
  images.sort(
    (a, b) =>
      (a.sheet?.sortOrder ?? 0) - (b.sheet?.sortOrder ?? 0) ||
      (a.materialId ?? "").localeCompare(b.materialId ?? "") ||
      a.variantIndex - b.variantIndex ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );

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
      attempt: img.attempt,
      materialId: img.materialId,
      canRetry: (img.status === "SUCCESS" || img.status === "FAILED") && canEditOwned(user, img.createdById),
    };
  });
}
