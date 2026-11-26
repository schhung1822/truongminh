"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth/dal";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { clientFromEncryptedToken, envBotClient, newWebhookSecret, tokenHint, zaloWebhookUrl } from "@/lib/zalo";
import { ZaloClient, ZaloError } from "@/lib/zalo/client";

export type BotActionResult = { error?: string; ok?: string };

function msg(e: unknown): string {
  return (e instanceof ZaloError ? e.message : e instanceof Error ? e.message : "Có lỗi không xác định.").slice(0, 500);
}

function refresh() {
  revalidatePath("/admin/connections", "layout");
  revalidatePath("/admin/zalo", "layout"); // các trang Cài đặt Zalo hiện "đã có bot hay chưa" và danh sách bot để gán nhóm
}

const nameSchema = z.string().trim().min(1, "Vui lòng đặt tên gợi nhớ cho bot.").max(100, "Tên bot tối đa 100 ký tự.");
// Token Zalo nằm ngay trong đường dẫn gọi API nên không được chứa khoảng trắng hay dấu "/".
const tokenSchema = z
  .string()
  .trim()
  .min(10, "Token quá ngắn, hãy dán nguyên token lấy ở Zalo Bot Creator.")
  .max(300, "Token quá dài.")
  .regex(/^[^\s/?#]+$/, "Token không được chứa khoảng trắng hay dấu / ? #.");

/** Token này đã có trong hệ thống chưa (bot trong .env hoặc một bot đã kết nối, trừ `exceptId`). */
async function tokenInUse(token: string, exceptId?: string): Promise<string | null> {
  if (getEnv().ZALO_BOT_TOKEN === token) return "Token này đang là bot đặt trong file .env, không cần thêm lần nữa.";
  const rows = await db.zaloBot.findMany({ where: exceptId ? { id: { not: exceptId } } : {}, select: { name: true, tokenEnc: true } });
  for (const r of rows) {
    try {
      if (decryptSecret(r.tokenEnc) === token) return `Token này đã được kết nối với tên "${r.name}".`;
    } catch {
      /* dòng không giải mã được: bỏ qua */
    }
  }
  return null;
}

/**
 * Kết nối thêm một bot: hỏi Zalo (getMe, không tốn hạn mức) để chắc token đúng rồi mới lưu, token lưu mã hóa.
 * Chuỗi bí mật webhook tự sinh riêng cho bot này. Webhook chưa đăng ký ở bước này, quản trị viên bấm đăng ký sau.
 */
export async function addZaloBotAction(input: { name: string; token: string }): Promise<BotActionResult> {
  const admin = await requireAdmin();
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { error: name.error.issues[0].message };
  const token = tokenSchema.safeParse(input.token);
  if (!token.success) return { error: token.error.issues[0].message };

  const used = await tokenInUse(token.data);
  if (used) return { error: used };

  let me: Awaited<ReturnType<ZaloClient["getMe"]>>;
  try {
    me = await new ZaloClient(token.data, getEnv().ZALO_API_BASE).getMe();
  } catch (e) {
    return { error: `Chưa kết nối được, token chưa được lưu. ${msg(e)}` };
  }
  const zaloId = me?.id ? String(me.id).slice(0, 60) : null;
  if (zaloId && (await db.zaloBot.findUnique({ where: { zaloId }, select: { id: true } }))) {
    return { error: "Bot này đã được kết nối rồi. Nếu vừa đổi token trên Zalo, hãy dùng nút \"Đổi token\" của bot đó." };
  }

  await db.zaloBot.create({
    data: {
      name: name.data,
      tokenEnc: encryptSecret(token.data),
      tokenHint: tokenHint(token.data),
      webhookSecretEnc: encryptSecret(newWebhookSecret()),
      zaloId,
      accountName: me?.account_name?.slice(0, 150) ?? null,
      canJoinGroups: me?.can_join_groups ?? null,
      lastCheckedAt: new Date(),
    },
  });
  await logActivity({ actor: admin, action: "ZALO_BOT_ADD", target: name.data, detail: me?.account_name ? `Tên trên Zalo: ${me.account_name}` : null });
  refresh();
  return { ok: `Đã kết nối bot ${me?.account_name ?? name.data}. Bấm "Đăng ký webhook" để bot nhận được tin.` };
}

/** Đổi tên gợi nhớ hoặc bật/tắt một bot. Tắt = bot không gửi, không xử lý tin đến; cấu hình và nhóm vẫn giữ. */
export async function updateZaloBotAction(id: string, patch: { name?: string; isActive?: boolean }): Promise<BotActionResult> {
  const admin = await requireAdmin();
  const data: { name?: string; isActive?: boolean } = {};
  if (patch.name !== undefined) {
    const name = nameSchema.safeParse(patch.name);
    if (!name.success) return { error: name.error.issues[0].message };
    data.name = name.data;
  }
  if (typeof patch.isActive === "boolean") data.isActive = patch.isActive;
  let botName: string;
  try {
    botName = (await db.zaloBot.update({ where: { id }, data, select: { name: true } })).name;
  } catch {
    return { error: "Không tìm thấy bot." };
  }
  if (typeof patch.isActive === "boolean") await logActivity({ actor: admin, action: "ZALO_BOT_TOGGLE", target: botName, detail: patch.isActive ? "Bật" : "Tắt" });
  refresh();
  return { ok: patch.isActive === undefined ? "Đã lưu." : patch.isActive ? "Đã bật bot." : "Đã tắt bot." };
}

/** Thay token của một bot đã kết nối (khi tạo lại token trên Zalo). Token mới phải là của chính bot đó. */
export async function replaceZaloBotTokenAction(id: string, rawToken: string): Promise<BotActionResult> {
  const admin = await requireAdmin();
  const token = tokenSchema.safeParse(rawToken);
  if (!token.success) return { error: token.error.issues[0].message };
  const bot = await db.zaloBot.findUnique({ where: { id }, select: { zaloId: true, name: true } });
  if (!bot) return { error: "Không tìm thấy bot." };
  const used = await tokenInUse(token.data, id);
  if (used) return { error: used };

  let me: Awaited<ReturnType<ZaloClient["getMe"]>>;
  try {
    me = await new ZaloClient(token.data, getEnv().ZALO_API_BASE).getMe();
  } catch (e) {
    return { error: `Token mới chưa dùng được, giữ nguyên token cũ. ${msg(e)}` };
  }
  const zaloId = me?.id ? String(me.id).slice(0, 60) : null;
  if (bot.zaloId && zaloId && bot.zaloId !== zaloId) {
    return { error: "Token này là của một bot khác. Muốn dùng bot đó thì bấm \"Thêm bot\" để kết nối riêng." };
  }

  await db.zaloBot.update({
    where: { id },
    data: {
      tokenEnc: encryptSecret(token.data),
      tokenHint: tokenHint(token.data),
      zaloId: bot.zaloId ?? zaloId,
      accountName: me?.account_name?.slice(0, 150) ?? undefined,
      canJoinGroups: me?.can_join_groups ?? undefined,
      lastCheckedAt: new Date(),
      lastError: null,
    },
  });
  await logActivity({ actor: admin, action: "ZALO_BOT_TOKEN", target: bot.name });
  refresh();
  return { ok: "Đã đổi token." };
}

/** Gỡ một bot khỏi hệ thống. Nhóm và hội thoại của nó được giữ lại nhưng không còn gắn với bot này. */
export async function deleteZaloBotAction(id: string): Promise<BotActionResult> {
  const admin = await requireAdmin();
  let botName: string;
  try {
    botName = (await db.zaloBot.delete({ where: { id }, select: { name: true } })).name;
  } catch {
    return { error: "Không tìm thấy bot." };
  }
  await logActivity({ actor: admin, action: "ZALO_BOT_REMOVE", target: botName });
  refresh();
  return { ok: "Đã gỡ bot. Nhóm và hội thoại của bot này vẫn còn trong danh sách nhưng không gửi được cho tới khi gán bot khác." };
}

/** Kiểm tra token của một bot (getMe, không tốn hạn mức). `id` trống = bot đặt trong .env. */
export async function checkZaloBotAction(id: string | null): Promise<BotActionResult> {
  await requireAdmin();
  const row = id ? await db.zaloBot.findUnique({ where: { id }, select: { tokenEnc: true } }) : null;
  if (id && !row) return { error: "Không tìm thấy bot." };
  const client = row ? clientFromEncryptedToken(row.tokenEnc) : envBotClient();
  if (!client) {
    return { error: id ? "Không giải mã được token đã lưu (khóa mã hóa đã đổi). Hãy bấm \"Đổi token\" và dán lại token." : "Chưa có ZALO_BOT_TOKEN trong .env." };
  }
  try {
    const me = await client.getMe();
    if (id) {
      await db.zaloBot.update({
        where: { id },
        data: { accountName: me?.account_name?.slice(0, 150) ?? undefined, canJoinGroups: me?.can_join_groups ?? undefined, lastCheckedAt: new Date(), lastError: null },
      });
      refresh();
    }
    const canJoin = me?.can_join_groups === false ? " Lưu ý: Zalo báo bot này CHƯA được phép vào nhóm." : "";
    return { ok: `Kết nối được. Bot: ${me?.account_name ?? "(không rõ tên)"}.${canJoin}` };
  } catch (e) {
    if (id) {
      await db.zaloBot.update({ where: { id }, data: { lastCheckedAt: new Date(), lastError: msg(e) } }).catch(() => {});
      refresh();
    }
    return { error: msg(e) };
  }
}

/**
 * Đăng ký địa chỉ webhook của một bot với Zalo để bot nhận tin và tự nhận ra nhóm. Cần APP_URL là https công khai.
 * `id` trống = bot đặt trong .env (dùng ZALO_WEBHOOK_SECRET); bot đã kết nối ở đây dùng chuỗi bí mật tự sinh của nó.
 */
export async function registerZaloWebhookAction(id: string | null): Promise<BotActionResult> {
  await requireAdmin();
  const env = getEnv();
  if (!env.APP_URL.startsWith("https://")) {
    return { error: "Webhook cần APP_URL là địa chỉ https công khai. Máy dev (localhost) không dùng được, hãy thêm nhóm bằng tay." };
  }

  let client: ZaloClient | null;
  let secret: string | undefined;
  if (id) {
    const row = await db.zaloBot.findUnique({ where: { id }, select: { tokenEnc: true, webhookSecretEnc: true } });
    if (!row) return { error: "Không tìm thấy bot." };
    client = clientFromEncryptedToken(row.tokenEnc);
    try {
      secret = decryptSecret(row.webhookSecretEnc);
    } catch {
      secret = undefined;
    }
    if (!client || !secret) return { error: "Không giải mã được khóa đã lưu (khóa mã hóa đã đổi). Hãy gỡ bot rồi kết nối lại." };
  } else {
    client = envBotClient();
    if (!client) return { error: "Chưa có ZALO_BOT_TOKEN trong .env." };
    secret = env.ZALO_WEBHOOK_SECRET;
    if (!secret) return { error: "Chưa có ZALO_WEBHOOK_SECRET trong .env (chuỗi tự đặt 8-256 ký tự)." };
  }

  const url = zaloWebhookUrl(id);
  const fail = async (error: string): Promise<BotActionResult> => {
    if (id) {
      await db.zaloBot.update({ where: { id }, data: { lastError: error } }).catch(() => {});
      refresh();
    }
    return { error };
  };
  try {
    const r = await client.setWebhook(url, secret);
    const v = r?.verification;
    if (v && v.ok === false) return fail(`Đã lưu webhook nhưng Zalo không gọi được tới địa chỉ: ${v.hint ?? v.outcome ?? "không rõ lý do"}.`);
  } catch (e) {
    return fail(msg(e));
  }
  if (id) {
    await db.zaloBot.update({ where: { id }, data: { webhookSetAt: new Date(), lastError: null } });
    refresh();
  }
  return { ok: `Đã đăng ký webhook: ${url}` };
}
