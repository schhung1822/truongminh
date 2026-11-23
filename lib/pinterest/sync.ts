import "server-only";
import { db } from "@/lib/db";
import { getPinterestConfig } from "@/lib/env";
import { listBoardPins, listBoards } from "./client";
import { withAutoRefresh } from "./tokens";
import type { PinterestBoardApi, PinterestPinApi } from "./types";

/** Ảnh có độ phân giải tốt nhất Pinterest trả về cho một pin (ưu tiên lớn nhất). */
function bestImageUrl(media?: { images?: Record<string, { url: string }> }): string | null {
  if (!media?.images) return null;
  for (const size of ["1200x", "600x", "400x300", "150x150"]) {
    const img = media.images[size];
    if (img) return img.url;
  }
  return Object.values(media.images)[0]?.url ?? null;
}

async function fetchAllPages<T>(load: (bookmark?: string) => Promise<{ items: T[]; bookmark: string | null }>): Promise<T[]> {
  const all: T[] = [];
  const seen = new Set<string>();
  let bookmark: string | undefined;
  do {
    const page = await load(bookmark);
    all.push(...page.items);
    const next = page.bookmark ?? undefined;
    if (next && seen.has(next)) throw new Error("Pinterest trả bookmark phân trang bị lặp, đã dừng để tránh đồng bộ vô hạn.");
    if (next) seen.add(next);
    bookmark = next;
  } while (bookmark);
  return all;
}

export type SyncResult = { boards: number; pins: number };

/**
 * Đồng bộ lại toàn bộ board + pin của tài khoản Pinterest đã kết nối vào CSDL (bộ nhớ đệm để màn chọn ảnh phong cách
 * đọc nhanh, không gọi Pinterest mỗi lần sale mở màn chọn). Chạy khi admin bấm "Đồng bộ ngay" ở /admin/pinterest.
 */
export async function syncPinterestAccount(accountId: string): Promise<SyncResult> {
  const config = getPinterestConfig();
  if (!config) throw new Error("Chưa cấu hình PINTEREST_CLIENT_ID/PINTEREST_CLIENT_SECRET trong .env.");
  const account = await db.pinterestAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("Không tìm thấy tài khoản Pinterest đã kết nối.");

  try {
    const boards = await withAutoRefresh(account, config, (token) => fetchAllPages<PinterestBoardApi>((bookmark) => listBoards(token, bookmark)));

    let pinTotal = 0;
    for (const b of boards) {
      const board = await db.pinterestBoard.upsert({
        where: { pinterestBoardId: b.id },
        create: {
          accountId,
          pinterestBoardId: b.id,
          name: b.name,
          description: b.description ?? null,
          privacy: b.privacy ?? "PUBLIC",
          pinCount: b.pin_count ?? 0,
          coverImageUrl: b.media?.image_cover_url ?? null,
          lastSyncedAt: new Date(),
        },
        update: {
          accountId,
          name: b.name,
          description: b.description ?? null,
          privacy: b.privacy ?? "PUBLIC",
          pinCount: b.pin_count ?? 0,
          coverImageUrl: b.media?.image_cover_url ?? null,
          lastSyncedAt: new Date(),
        },
      });

      const pins = await withAutoRefresh(account, config, (token) => fetchAllPages<PinterestPinApi>((bookmark) => listBoardPins(token, b.id, bookmark)));
      let importedPins = 0;
      for (const p of pins) {
        const sourceImageUrl = bestImageUrl(p.media);
        if (!sourceImageUrl) continue; // pin video hoặc không có ảnh: bỏ qua, không dùng được làm ảnh tham khảo
        await db.pinterestPin.upsert({
          where: { pinterestPinId: p.id },
          create: { boardId: board.id, pinterestPinId: p.id, title: p.title ?? null, description: p.description ?? null, altText: p.alt_text ?? null, sourceImageUrl },
          update: { boardId: board.id, title: p.title ?? null, description: p.description ?? null, altText: p.alt_text ?? null, sourceImageUrl },
        });
        importedPins++;
      }
      pinTotal += importedPins;
    }

    await db.pinterestAccount.update({ where: { id: accountId }, data: { lastSyncedAt: new Date(), lastSyncError: null } });
    return { boards: boards.length, pins: pinTotal };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.pinterestAccount.update({ where: { id: accountId }, data: { lastSyncError: message } });
    throw e;
  }
}
