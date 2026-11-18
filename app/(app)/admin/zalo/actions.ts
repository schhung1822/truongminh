"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getZaloClient } from "@/lib/zalo";
import { ZaloError } from "@/lib/zalo/client";

export type ActionResult = { error?: string; ok?: string };

function msg(e: unknown): string {
  return e instanceof ZaloError ? e.message : e instanceof Error ? e.message : "Có lỗi không xác định.";
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

/** Thêm nhóm bằng tay (khi chưa dùng webhook): dán chat.id của nhóm. */
export async function addGroupAction(input: { name: string; chatId: string }): Promise<ActionResult> {
  await requireAdmin();
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (await db.zaloGroup.findUnique({ where: { chatId: parsed.data.chatId }, select: { id: true } })) {
    return { error: "Mã nhóm này đã có trong danh sách." };
  }
  await db.zaloGroup.create({ data: parsed.data });
  revalidatePath("/admin/zalo");
  return { ok: "Đã thêm nhóm." };
}

const patchSchema = z.object({
  name: z.string().trim().min(1, "Tên nhóm không được để trống.").max(100).optional(),
  isActive: z.boolean().optional(),
  autoSend: z.boolean().optional(),
});

export async function updateGroupAction(id: string, patch: z.input<typeof patchSchema>): Promise<ActionResult> {
  await requireAdmin();
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = { ...parsed.data };
  // nhóm bị tắt thì không còn tự động gửi
  if (data.isActive === false) data.autoSend = false;
  if (data.autoSend === true && data.isActive === undefined) {
    const g = await db.zaloGroup.findUnique({ where: { id }, select: { isActive: true } });
    if (!g) return { error: "Không tìm thấy nhóm." };
    if (!g.isActive) return { error: "Nhóm đang tắt, hãy bật nhóm trước khi bật tự động gửi." };
  }
  try {
    await db.zaloGroup.update({ where: { id }, data });
  } catch {
    return { error: "Không tìm thấy nhóm." };
  }
  revalidatePath("/admin/zalo");
  return { ok: "Đã lưu." };
}

export async function deleteGroupAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await db.zaloGroup.delete({ where: { id } }); // lịch sử gửi của nhóm này cũng bị xóa theo
  } catch {
    return { error: "Không tìm thấy nhóm." };
  }
  revalidatePath("/admin/zalo");
  return { ok: "Đã xóa nhóm khỏi danh sách (bot vẫn còn trong nhóm Zalo nếu chưa bị mời ra)." };
}

/** Gửi một tin chữ thử vào nhóm để chắc chắn bot gửi được. Tốn 1 tin trong hạn mức tháng của bot. */
export async function testGroupAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  const client = getZaloClient();
  if (!client) return { error: "Chưa cấu hình ZALO_BOT_TOKEN trong .env." };
  const group = await db.zaloGroup.findUnique({ where: { id }, select: { chatId: true } });
  if (!group) return { error: "Không tìm thấy nhóm." };
  try {
    await client.sendMessage(group.chatId, "Tin nhắn thử từ hệ thống ảnh mẫu in logo. Nếu bạn thấy tin này thì bot gửi được vào nhóm.");
    return { ok: "Đã gửi tin thử, hãy xem trong nhóm Zalo." };
  } catch (e) {
    return { error: msg(e) };
  }
}

/** Kiểm tra token bot (getMe, không tốn hạn mức). */
export async function checkConnectionAction(): Promise<ActionResult> {
  await requireAdmin();
  const client = getZaloClient();
  if (!client) return { error: "Chưa cấu hình ZALO_BOT_TOKEN trong .env." };
  try {
    const me = await client.getMe();
    const canJoin = me.can_join_groups === false ? " Lưu ý: Zalo báo bot này CHƯA được phép vào nhóm." : "";
    return { ok: `Kết nối được. Bot: ${me.account_name ?? "(không rõ tên)"}.${canJoin}` };
  } catch (e) {
    return { error: msg(e) };
  }
}

/** Đăng ký địa chỉ webhook với Zalo để bot tự nhận diện nhóm. Cần APP_URL là https công khai và ZALO_WEBHOOK_SECRET. */
export async function registerWebhookAction(): Promise<ActionResult> {
  await requireAdmin();
  const client = getZaloClient();
  if (!client) return { error: "Chưa cấu hình ZALO_BOT_TOKEN trong .env." };
  const env = getEnv();
  if (!env.ZALO_WEBHOOK_SECRET) return { error: "Chưa có ZALO_WEBHOOK_SECRET trong .env (chuỗi tự đặt 8-256 ký tự)." };
  if (!env.APP_URL.startsWith("https://")) {
    return { error: "Webhook cần APP_URL là địa chỉ https công khai. Máy dev (localhost) không dùng được, hãy thêm nhóm bằng tay." };
  }
  const url = `${env.APP_URL.replace(/\/$/, "")}/api/webhooks/zalo`;
  try {
    const r = await client.setWebhook(url, env.ZALO_WEBHOOK_SECRET);
    const v = r?.verification;
    if (v && v.ok === false) return { error: `Đã lưu webhook nhưng Zalo không gọi được tới địa chỉ: ${v.hint ?? v.outcome ?? "không rõ lý do"}.` };
    return { ok: `Đã đăng ký webhook: ${url}` };
  } catch (e) {
    return { error: msg(e) };
  }
}
