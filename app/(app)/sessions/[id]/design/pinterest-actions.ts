"use server";

import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";

export type PickerBoard = { id: string; name: string; pinCount: number; coverImageUrl: string | null; techniqueHint: string | null };
export type PickerPin = { id: string; title: string | null; sourceImageUrl: string };
export type PickerPinPage = { items: PickerPin[]; nextOffset: number | null };

const PICKER_PAGE_SIZE = 60;

/** Board đã đồng bộ, để sale chọn ảnh phong cách tham khảo khi thiết kế (bất kỳ ai đăng nhập cũng xem được, chỉ admin mới kết nối/đồng bộ được). */
export async function listPinterestBoardsForPickerAction(): Promise<PickerBoard[]> {
  await requireUser();
  const boards = await db.pinterestBoard.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { pins: true } } } });
  return boards.map((b) => ({ id: b.id, name: b.name, pinCount: b._count.pins, coverImageUrl: b.coverImageUrl, techniqueHint: b.techniqueHint }));
}

export async function listPinterestPinsForPickerAction(boardId: string, offset = 0): Promise<PickerPinPage> {
  await requireUser();
  const safeBoardId = boardId.trim().slice(0, 191);
  const safeOffset = Number.isSafeInteger(offset) && offset >= 0 ? Math.min(offset, 200_000) : 0;
  if (!safeBoardId) return { items: [], nextOffset: null };
  const pins = await db.pinterestPin.findMany({
    where: { boardId: safeBoardId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: safeOffset,
    take: PICKER_PAGE_SIZE + 1,
    select: { id: true, title: true, sourceImageUrl: true },
  });
  const hasMore = pins.length > PICKER_PAGE_SIZE;
  const next = safeOffset + PICKER_PAGE_SIZE;
  return { items: pins.slice(0, PICKER_PAGE_SIZE), nextOffset: hasMore && next <= 200_000 ? next : null };
}

/** Pin khách (của logo này) đã thích, để picker gợi ý ngay trước khi phải tự tìm board (xem docs/DECISIONS.md D98). */
export async function listLogoFavoritePinsForPickerAction(logoId: string): Promise<PickerPin[]> {
  await requireUser();
  const safeLogoId = logoId.trim().slice(0, 191);
  if (!safeLogoId) return [];
  const favorites = await db.logoFavoritePin.findMany({
    where: { logoId: safeLogoId },
    orderBy: { createdAt: "desc" },
    select: { pin: { select: { id: true, title: true, sourceImageUrl: true } } },
  });
  return favorites.map((f) => f.pin);
}
