"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";

export type FavoriteActionResult = { error?: string; favorited?: boolean };

/**
 * Bật/tắt "pin khách thích" cho một logo (xem docs/DECISIONS.md D98). Sale bấm khi gửi ảnh cho khách qua Zalo
 * để thiết kế mở logo lên là biết ngay khách thích phong cách nào, không phải hỏi lại.
 */
export async function toggleLogoFavoritePinAction(logoId: string, pinId: string): Promise<FavoriteActionResult> {
  const user = await requireUser();
  const [logo, pin] = await Promise.all([
    db.logo.findUnique({ where: { id: logoId }, select: { id: true } }),
    db.pinterestPin.findUnique({ where: { id: pinId }, select: { id: true } }),
  ]);
  if (!logo) return { error: "Không tìm thấy logo." };
  if (!pin) return { error: "Không tìm thấy pin." };

  const existing = await db.logoFavoritePin.findUnique({ where: { logoId_pinId: { logoId, pinId } } });
  if (existing) {
    await db.logoFavoritePin.delete({ where: { id: existing.id } });
    revalidatePath("/pinterest");
    return { favorited: false };
  }
  await db.logoFavoritePin.create({ data: { logoId, pinId, createdById: user.id } });
  revalidatePath("/pinterest");
  return { favorited: true };
}
