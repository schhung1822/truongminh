"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { syncPinterestAccount, watchBoard } from "@/lib/pinterest/sync";

export type PinterestActionResult = { error?: string; ok?: string };

export async function syncPinterestAction(): Promise<PinterestActionResult> {
  await requireAdmin();
  const account = await db.pinterestAccount.findFirst({ select: { id: true } });
  if (!account) return { error: "Chưa kết nối tài khoản Pinterest nào." };
  try {
    const r = await syncPinterestAccount(account.id);
    revalidatePath("/admin/connections", "layout");
    return { ok: `Đã đồng bộ ${r.boards} board, ${r.pins} pin.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Đồng bộ thất bại." };
  }
}

/**
 * Ngắt kết nối: xóa tài khoản + board + pin đã đồng bộ (CASCADE). Ảnh thiết kế đã tạo xong trước đó không bị ảnh hưởng
 * (ảnh đã lưu rồi); phiên đang chờ tạo mà có chọn ảnh phong cách sẽ tự bỏ qua ảnh đó, vẫn ra ảnh bình thường.
 */
export async function disconnectPinterestAction(): Promise<PinterestActionResult> {
  const admin = await requireAdmin();
  const account = await db.pinterestAccount.findFirst({ select: { id: true, username: true } });
  if (!account) return { error: "Chưa kết nối tài khoản Pinterest nào." };
  await db.pinterestAccount.delete({ where: { id: account.id } });
  await logActivity({ actor: admin, action: "PINTEREST_DISCONNECT", target: `@${account.username}` });
  revalidatePath("/admin/connections", "layout");
  return { ok: "Đã ngắt kết nối Pinterest." };
}

/**
 * Gắn board với một "technique" (MaterialOption loại TECHNIQUE) mà board đó đại diện, để picker ảnh phong cách
 * khi thiết kế tự gợi ý đúng board theo công nghệ chất liệu khách đã chọn. value rỗng = bỏ liên kết.
 */
export async function setBoardTechniqueHintAction(boardId: string, value: string): Promise<PinterestActionResult> {
  await requireAdmin();
  const board = await db.pinterestBoard.findUnique({ where: { id: boardId }, select: { id: true } });
  if (!board) return { error: "Không tìm thấy board." };
  const clean = value.trim();
  if (clean) {
    const option = await db.materialOption.findFirst({ where: { type: "TECHNIQUE", value: clean }, select: { id: true } });
    if (!option) return { error: "Không tìm thấy công nghệ này." };
  }
  await db.pinterestBoard.update({ where: { id: boardId }, data: { techniqueHint: clean || null } });
  revalidatePath("/admin/connections", "layout");
  return { ok: "Đã cập nhật gợi ý board." };
}

/**
 * Bật/tắt "gửi pin mới vào nhóm Zalo" cho một board (docs/DECISIONS.md D127). Lúc bật, hệ thống tải đủ pin hiện có của
 * board trước (không gửi), nên chỉ pin lưu SAU lúc bật mới được bot gửi vào nhóm.
 */
export async function setBoardZaloFeedAction(boardId: string, on: boolean): Promise<PinterestActionResult> {
  await requireAdmin();
  const board = await db.pinterestBoard.findUnique({ where: { id: boardId }, select: { id: true, name: true } });
  if (!board) return { error: "Không tìm thấy board." };
  if (on) {
    try {
      await watchBoard(board.id);
    } catch (e) {
      return { error: `Chưa bật được vì không tải được pin của board: ${e instanceof Error ? e.message : "lỗi không xác định"}` };
    }
  } else {
    await db.pinterestBoard.update({ where: { id: board.id }, data: { zaloFeed: false } });
  }
  revalidatePath("/admin/connections", "layout");
  return { ok: on ? `Đã bật. Pin lưu vào "${board.name}" từ bây giờ sẽ được bot gửi vào các nhóm Zalo nhận mẫu.` : `Đã tắt gửi pin mới của "${board.name}".` };
}
