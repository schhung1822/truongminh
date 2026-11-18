"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { testChat } from "@/lib/zalo/inbox";
import { getZaloSettings, saveZaloSettings, zaloSettingsSchema, type ZaloSettings } from "@/lib/zalo/settings";

type Result = { error?: string; ok?: string };

/** Lưu công tắc và cấu hình các chức năng Zalo. */
export async function saveZaloSettingsAction(values: ZaloSettings): Promise<Result> {
  await requireAdmin();
  const parsed = zaloSettingsSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await saveZaloSettings(parsed.data);
  revalidatePath("/admin/zalo");
  revalidatePath("/zalo");
  return { ok: "Đã lưu cấu hình Zalo." };
}

/** Bật/tắt nhanh một công tắc (lưu ngay). */
export async function toggleZaloFeatureAction(name: keyof ZaloSettings, value: boolean): Promise<Result> {
  await requireAdmin();
  const current = await getZaloSettings();
  if (typeof current[name] !== "boolean") return { error: "Công tắc không hợp lệ." };
  await saveZaloSettings({ ...current, [name]: value });
  revalidatePath("/admin/zalo");
  revalidatePath("/zalo");
  return { ok: value ? "Đã bật." : "Đã tắt." };
}

/** Gửi một câu thử tới model chat để biết tên model và khóa kie.ai dùng được (tốn rất ít token). */
export async function testChatAction(model: string): Promise<Result> {
  await requireAdmin();
  const name = model.trim();
  if (!name) return { error: "Vui lòng nhập tên model." };
  const r = await testChat(name);
  return r.ok ? { ok: `AI trả lời được (${r.tokens} token): "${r.text}"` } : { error: r.error };
}

/** Cho phép một tài khoản Zalo đã xin ghép nối trở thành nhân viên. Phải đối chiếu đúng mã 4 số. */
export async function approvePairAction(contactId: string, code: string): Promise<Result> {
  await requireAdmin();
  const c = await db.zaloContact.findUnique({ where: { id: contactId } });
  if (!c || !c.pairCode) return { error: "Không còn yêu cầu ghép nối này." };
  if (c.pairCode !== code.trim()) return { error: "Mã không khớp. Hãy nhập đúng mã 4 số mà người đó nhận được từ bot." };
  await db.zaloContact.update({ where: { id: contactId }, data: { role: "STAFF", pairCode: null, pairRequestedAt: null, needsHuman: false, unreadCount: 0 } });
  revalidatePath("/admin/zalo");
  return { ok: `Đã cho phép ${c.displayName}. Người đó gõ /help trong Zalo để xem lệnh.` };
}

export async function rejectPairAction(contactId: string): Promise<Result> {
  await requireAdmin();
  await db.zaloContact.updateMany({ where: { id: contactId, role: "CUSTOMER" }, data: { pairCode: null, pairRequestedAt: null } });
  revalidatePath("/admin/zalo");
  return { ok: "Đã từ chối." };
}

/** Thu hồi quyền nhân viên (trở lại là khách). */
export async function revokeStaffAction(contactId: string): Promise<Result> {
  await requireAdmin();
  await db.zaloContact.updateMany({ where: { id: contactId, role: "STAFF" }, data: { role: "CUSTOMER" } });
  revalidatePath("/admin/zalo");
  return { ok: "Đã thu hồi quyền nhân viên." };
}
