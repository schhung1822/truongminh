"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { restartPinFeed } from "@/lib/pinterest/feed-queue";
import { testChat } from "@/lib/zalo/bot";
import { ZALO_SETTING_DEFAULTS, updateZaloSettings, type ZaloSettings } from "@/lib/zalo/settings";

type Result = { error?: string; ok?: string };

function refresh() {
  revalidatePath("/admin/zalo", "layout");
  revalidatePath("/zalo/care");
}

/** Lưu một phần cấu hình Zalo (mỗi trang cài đặt chỉ gửi các mục của mình). */
export async function saveZaloSettingsAction(patch: Partial<ZaloSettings>): Promise<Result> {
  await requireAdmin();
  const r = await updateZaloSettings(patch);
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: "Đã lưu cấu hình Zalo." };
}

/** Bật/tắt nhanh một công tắc (lưu ngay). */
export async function toggleZaloFeatureAction(name: keyof ZaloSettings, value: boolean): Promise<Result> {
  await requireAdmin();
  if (typeof ZALO_SETTING_DEFAULTS[name] !== "boolean") return { error: "Công tắc không hợp lệ." };
  const r = await updateZaloSettings({ [name]: value });
  if (!r.ok) return { error: r.error };
  // Bật lại Zalo hoặc bật lại "gửi mẫu Pinterest mới": bắt đầu theo dõi lại từ lúc này, pin lưu trong lúc tắt không bị gửi (D127)
  if (value && (name === "enabled" || name === "pinFeed")) await restartPinFeed();
  refresh();
  if (name === "pinFeed" || name === "enabled") revalidatePath("/admin/connections", "layout"); // thẻ trạng thái ở Kết nối > Pinterest
  if (name === "inbox") revalidatePath("/", "layout"); // mục Hộp thư Zalo hiện/ẩn trên menu của mọi trang
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
export async function approvePairAction(contactId: string, code: string, userId?: string): Promise<Result> {
  await requireAdmin();
  const c = await db.zaloContact.findUnique({ where: { id: contactId } });
  if (!c || !c.pairCode) return { error: "Không còn yêu cầu ghép nối này." };
  if (c.pairCode !== code.trim()) return { error: "Mã không khớp. Hãy nhập đúng mã 4 số mà người đó nhận được từ bot." };
  if (userId && !(await db.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true } }))) return { error: "Không tìm thấy tài khoản web này." };
  await db.zaloContact.update({
    where: { id: contactId },
    data: { role: "STAFF", userId: userId || null, pairCode: null, pairRequestedAt: null, needsHuman: false, botPaused: false, botPausedAt: null },
  });
  refresh();
  return { ok: `Đã cho phép ${c.displayName}. Người đó gõ /help trong Zalo để xem lệnh.` };
}

/** Gắn (hoặc gỡ) tài khoản web cho một nhân viên đã ghép nối: lệnh người đó ra cho bot chạy dưới tên và hạn mức của tài khoản này. */
export async function linkStaffUserAction(contactId: string, userId: string | null): Promise<Result> {
  await requireAdmin();
  if (userId && !(await db.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true } }))) return { error: "Không tìm thấy tài khoản web này." };
  const r = await db.zaloContact.updateMany({ where: { id: contactId, role: "STAFF" }, data: { userId } });
  if (r.count === 0) return { error: "Không tìm thấy nhân viên này." };
  refresh();
  return { ok: userId ? "Đã gắn tài khoản web." : "Đã gỡ tài khoản web." };
}

export async function rejectPairAction(contactId: string): Promise<Result> {
  await requireAdmin();
  await db.zaloContact.updateMany({ where: { id: contactId, role: "CUSTOMER" }, data: { pairCode: null, pairRequestedAt: null } });
  refresh();
  return { ok: "Đã từ chối." };
}

/** Thu hồi quyền nhân viên (trở lại là khách). */
export async function revokeStaffAction(contactId: string): Promise<Result> {
  await requireAdmin();
  await db.zaloContact.updateMany({ where: { id: contactId, role: "STAFF" }, data: { role: "CUSTOMER", userId: null } });
  refresh();
  return { ok: "Đã thu hồi quyền nhân viên." };
}

/** Xóa tin nhắn Zalo đã lưu cũ hơn N ngày (nội dung hội thoại trong Hộp thư). Không đụng tới ảnh đã gửi nhóm hay kịch bản chăm sóc. */
export async function clearOldMessagesAction(days: number): Promise<Result> {
  await requireAdmin();
  if (!Number.isInteger(days) || days < 1 || days > 3650) return { error: "Số ngày phải từ 1 đến 3650." };
  const before = new Date(Date.now() - days * 86400_000);
  const r = await db.zaloMessage.deleteMany({ where: { createdAt: { lt: before } } });
  refresh();
  return { ok: `Đã xóa ${r.count.toLocaleString("vi-VN")} tin cũ hơn ${days} ngày.` };
}
