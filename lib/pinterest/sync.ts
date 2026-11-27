import "server-only";
import type { PinterestAccount } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getPinterestConfig, type PinterestConfig } from "@/lib/env";
import { createLimiter, type Limiter } from "@/lib/jobs/async";
import { getBoard, listBoardPins, listBoards } from "./client";
import { boardStamp, canAnnounce } from "./feed";
import { queuePinsForZalo } from "./feed-queue";
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

/**
 * Mọi việc ghi board/pin vào CSDL (đồng bộ tay, đồng bộ định kỳ, vòng theo dõi pin mới) chạy lần lượt qua khóa này,
 * để hai việc không cùng nhập một pin. Gắn vào globalThis vì các nhóm mã của Next (trang, route, instrumentation) nạp
 * file này riêng nhưng chạy chung một tiến trình.
 */
const g = globalThis as unknown as { __pinterestSyncLock?: Limiter };
export function pinterestLock(): Limiter {
  return (g.__pinterestSyncLock ??= createLimiter(1));
}

export function requirePinterestConfig(): PinterestConfig {
  const config = getPinterestConfig();
  if (!config) throw new Error("Chưa cấu hình PINTEREST_CLIENT_ID/PINTEREST_CLIENT_SECRET trong .env.");
  return config;
}

/** Danh sách board hiện có trên Pinterest của tài khoản (đủ mọi trang). */
export function fetchBoards(account: PinterestAccount, config: PinterestConfig): Promise<PinterestBoardApi[]> {
  return withAutoRefresh(account, config, (token) => fetchAllPages<PinterestBoardApi>((bookmark) => listBoards(token, bookmark)));
}

type BoardRef = { id: string; pinterestBoardId: string };

/**
 * Tải đủ pin của MỘT board từ Pinterest rồi nhập vào CSDL, và ghi lại "dấu" của board (boardStamp) lúc nhập.
 * Trả về số pin có ảnh và danh sách pin VỪA XUẤT HIỆN trong board (chưa từng có trong board này ở CSDL), xếp theo lúc
 * lưu, cũ trước; nơi gọi quyết định có gửi chúng vào nhóm Zalo hay không. Phải tải đủ mọi trang vì Pinterest không
 * cam kết thứ tự trả pin. `onlyNew`: chỉ ghi pin mới, không cập nhật lại tiêu đề/ảnh của pin đã có (cho vòng theo dõi,
 * chạy rất thường xuyên).
 */
export async function importBoardPins(
  account: PinterestAccount,
  config: PinterestConfig,
  board: BoardRef,
  api: PinterestBoardApi,
  opts: { onlyNew: boolean },
): Promise<{ imported: number; fresh: string[] }> {
  const pins = await withAutoRefresh(account, config, (token) => fetchAllPages<PinterestPinApi>((bookmark) => listBoardPins(token, board.pinterestBoardId, bookmark)));
  const known = new Set((await db.pinterestPin.findMany({ where: { boardId: board.id }, select: { pinterestPinId: true } })).map((p) => p.pinterestPinId));

  let imported = 0;
  const seen = new Set<string>();
  const fresh: { id: string; savedAt: number }[] = [];
  for (const p of pins) {
    const sourceImageUrl = bestImageUrl(p.media);
    if (!sourceImageUrl) continue; // pin video hoặc không có ảnh: bỏ qua, không dùng được làm ảnh tham khảo
    if (seen.has(p.id)) continue; // hai trang trả trùng một pin
    seen.add(p.id);
    imported++;
    const isNew = !known.has(p.id);
    if (opts.onlyNew && !isNew) continue;
    const row = await db.pinterestPin.upsert({
      where: { pinterestPinId: p.id },
      create: { boardId: board.id, pinterestPinId: p.id, title: p.title ?? null, description: p.description ?? null, altText: p.alt_text ?? null, sourceImageUrl },
      update: { boardId: board.id, title: p.title ?? null, description: p.description ?? null, altText: p.alt_text ?? null, sourceImageUrl },
      select: { id: true },
    });
    if (isNew) fresh.push({ id: row.id, savedAt: (p.created_at && Date.parse(p.created_at)) || 0 });
  }
  fresh.sort((a, b) => a.savedAt - b.savedAt);

  const now = new Date();
  await db.pinterestBoard.update({
    where: { id: board.id },
    data: { pinCount: api.pin_count ?? 0, pinsStamp: boardStamp(api), feedCheckedAt: now, lastSyncedAt: now },
  });
  return { imported, fresh: fresh.map((f) => f.id) };
}

export type SyncResult = { boards: number; pins: number };

/**
 * Đồng bộ lại toàn bộ board + pin của tài khoản Pinterest đã kết nối vào CSDL (bộ nhớ đệm để màn chọn ảnh phong cách
 * đọc nhanh, không gọi Pinterest mỗi lần sale mở màn chọn). Chạy khi admin bấm "Đồng bộ ngay" ở /admin/connections/pinterest
 * hoặc khi máy chủ gọi /api/jobs/pinterest-sync. Pin mới thấy ở board đang theo dõi cũng được xếp hàng gửi vào nhóm Zalo
 * (D127), như vòng theo dõi vẫn làm, để lượt đồng bộ này không "nuốt" mất pin mà vòng theo dõi chưa kịp thấy.
 */
export async function syncPinterestAccount(accountId: string): Promise<SyncResult> {
  const config = requirePinterestConfig();
  const account = await db.pinterestAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("Không tìm thấy tài khoản Pinterest đã kết nối.");

  return pinterestLock()(async () => {
    try {
      const boards = await fetchBoards(account, config);

      let pinTotal = 0;
      const toAnnounce: string[] = [];
      for (const b of boards) {
        const fields = {
          accountId,
          name: b.name,
          description: b.description ?? null,
          privacy: b.privacy ?? "PUBLIC",
          coverImageUrl: b.media?.image_cover_url ?? null,
        };
        // pinCount, pinsStamp, feedCheckedAt của board do importBoardPins ghi SAU khi nhập xong pin: lần nhập bị lỗi giữa
        // chừng thì dấu cũ còn nguyên, vòng theo dõi vẫn thấy board "có thay đổi" và nhập lại.
        const board = await db.pinterestBoard.upsert({
          where: { pinterestBoardId: b.id },
          create: { ...fields, pinterestBoardId: b.id, pinCount: b.pin_count ?? 0 },
          update: fields,
          select: { id: true, pinterestBoardId: true, zaloFeed: true, feedCheckedAt: true },
        });

        const r = await importBoardPins(account, config, board, b, { onlyNew: false });
        pinTotal += r.imported;
        if (board.zaloFeed && canAnnounce(board.feedCheckedAt)) toAnnounce.push(...r.fresh);
      }

      await db.pinterestAccount.update({ where: { id: accountId }, data: { lastSyncedAt: new Date(), lastSyncError: null } });
      await queuePinsForZalo(toAnnounce);
      return { boards: boards.length, pins: pinTotal };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.pinterestAccount.update({ where: { id: accountId }, data: { lastSyncError: message } });
      throw e;
    }
  });
}

/**
 * Bắt đầu theo dõi một board để gửi pin mới vào nhóm Zalo. Trước khi bật, nhập đủ pin hiện có của board (không gửi):
 * từ đó chỉ pin lưu SAU lúc bật mới được coi là mới. Không tải được pin thì không bật.
 */
export async function watchBoard(boardId: string): Promise<void> {
  const config = requirePinterestConfig();
  const board = await db.pinterestBoard.findUnique({ where: { id: boardId }, select: { id: true, pinterestBoardId: true, account: true } });
  if (!board) throw new Error("Không tìm thấy board.");
  await pinterestLock()(async () => {
    const api = await withAutoRefresh(board.account, config, (token) => getBoard(token, board.pinterestBoardId));
    await importBoardPins(board.account, config, board, api, { onlyNew: true });
    await db.pinterestBoard.update({ where: { id: board.id }, data: { zaloFeed: true } });
  });
}
