"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getBotClient, NO_BOT_MESSAGE } from "@/lib/zalo";
import { ZaloError } from "@/lib/zalo/client";

// Kiểm tra token và đăng ký webhook của từng bot đã chuyển sang Hệ thống > Kết nối > Zalo
// (app/(app)/admin/connections/zalo/bot-actions.ts). File này chỉ còn phần quản lý nhóm.

export type ActionResult = { error?: string; ok?: string };

function msg(e: unknown): string {
  return e instanceof ZaloError ? e.message : e instanceof Error ? e.message : "Có lỗi không xác định.";
}

/** Bot gán cho nhóm: chuỗi rỗng / null = bot trong .env (hoặc bot mặc định); còn lại phải là một bot có thật. */
async function resolveBotId(raw: string | null | undefined): Promise<{ botId: string | null } | { error: string }> {
  if (!raw) return { botId: null };
  const bot = await db.zaloBot.findUnique({ where: { id: raw }, select: { id: true } });
  return bot ? { botId: bot.id } : { error: "Không tìm thấy bot đã chọn." };
}

const groupSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên nhóm.").max(100),
  chatId: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập mã nhóm (chat id).")
    .max(100)
    .regex(/^[\w.-]+$/, "Mã nhóm chỉ gồm chữ, số, dấu chấm, gạch dưới và gạch ngang."),
});

/** Thêm nhóm bằng tay (khi chưa dùng webhook): dán chat.id của nhóm và chọn bot đang ở trong nhóm đó. */
export async function addGroupAction(input: { name: string; chatId: string; botId?: string | null }): Promise<ActionResult> {
  await requireAdmin();
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (await db.zaloGroup.findUnique({ where: { chatId: parsed.data.chatId }, select: { id: true } })) {
    return { error: "Mã nhóm này đã có trong danh sách." };
  }
  const bot = await resolveBotId(input.botId);
  if ("error" in bot) return bot;
  await db.zaloGroup.create({ data: { ...parsed.data, botId: bot.botId } });
  revalidatePath("/admin/zalo", "layout");
  return { ok: "Đã thêm nhóm." };
}

const patchSchema = z.object({
  name: z.string().trim().min(1, "Tên nhóm không được để trống.").max(100).optional(),
  isActive: z.boolean().optional(),
});

/** Sửa tên, bật/tắt, hoặc đổi bot của nhóm (`botId` rỗng = bot trong .env / bot mặc định). */
export async function updateGroupAction(id: string, patch: z.input<typeof patchSchema> & { botId?: string | null }): Promise<ActionResult> {
  await requireAdmin();
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data: { name?: string; isActive?: boolean; botId?: string | null } = { ...parsed.data };
  if (patch.botId !== undefined) {
    const bot = await resolveBotId(patch.botId);
    if ("error" in bot) return bot;
    data.botId = bot.botId;
  }
  try {
    await db.zaloGroup.update({ where: { id }, data });
  } catch {
    return { error: "Không tìm thấy nhóm." };
  }
  revalidatePath("/admin/zalo", "layout");
  return { ok: "Đã lưu." };
}

export async function deleteGroupAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await db.zaloGroup.delete({ where: { id } }); // lịch sử gửi của nhóm này cũng bị xóa theo
  } catch {
    return { error: "Không tìm thấy nhóm." };
  }
  revalidatePath("/admin/zalo", "layout");
  return { ok: "Đã xóa nhóm khỏi danh sách (bot vẫn còn trong nhóm Zalo nếu chưa bị mời ra)." };
}

/** Gửi một tin chữ thử vào nhóm (bằng đúng bot của nhóm) để chắc chắn bot gửi được. Tốn 1 tin trong hạn mức tháng của bot. */
export async function testGroupAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  const group = await db.zaloGroup.findUnique({ where: { id }, select: { chatId: true, botId: true } });
  if (!group) return { error: "Không tìm thấy nhóm." };
  const client = await getBotClient(group.botId);
  if (!client) return { error: NO_BOT_MESSAGE };
  try {
    await client.sendMessage(group.chatId, "Tin nhắn thử từ hệ thống ảnh mẫu in logo. Nếu bạn thấy tin này thì bot gửi được vào nhóm.");
    return { ok: "Đã gửi tin thử, hãy xem trong nhóm Zalo." };
  } catch (e) {
    return { error: msg(e) };
  }
}
