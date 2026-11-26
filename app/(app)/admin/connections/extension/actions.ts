"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { requireFbManager } from "@/lib/fb/access";
import { canonicalProfileUrl } from "@/lib/fb/urls";
import { fbConfigSchema, saveFbConfig } from "@/lib/ext/config";
import { generateExtToken } from "@/lib/ext/token";

export type FbFormState = { error?: string; ok?: string; token?: string };

const accountSchema = z.object({
  displayName: z.string().trim().min(1, "Vui lòng nhập tên hiển thị trên Facebook.").max(150),
  profileUrl: z.string().trim().min(1, "Vui lòng nhập link trang cá nhân.").max(300),
});

/** Thêm một nick Facebook. Nick thuộc về người tạo (quản trị viên có thể chọn chủ nick khác). */
export async function createAccountAction(_prev: FbFormState, formData: FormData): Promise<FbFormState> {
  const user = await requireFbManager();
  const parsed = accountSchema.safeParse({ displayName: formData.get("displayName"), profileUrl: formData.get("profileUrl") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const profileUrl = canonicalProfileUrl(parsed.data.profileUrl);
  if (!profileUrl) return { error: "Link trang cá nhân không hợp lệ. Dán link dạng facebook.com/ten.ban hoặc facebook.com/profile.php?id=..." };

  let ownerId = user.id;
  const requested = String(formData.get("ownerId") ?? "");
  if (user.role === "ADMIN" && requested && requested !== user.id) {
    const owner = await db.user.findFirst({ where: { id: requested, isActive: true }, select: { id: true } });
    if (!owner) return { error: "Không tìm thấy người dùng được chọn." };
    ownerId = owner.id;
  }

  const existing = await db.fbAccount.findMany({ select: { profileUrl: true } });
  if (existing.some((a) => a.profileUrl.toLowerCase() === profileUrl.toLowerCase())) {
    return { error: "Nick này đã có trong danh sách." };
  }
  await db.fbAccount.create({ data: { userId: ownerId, displayName: parsed.data.displayName, profileUrl } });
  await logActivity({ actor: user, action: "EXT_ACCOUNT_CREATE", target: parsed.data.displayName, detail: profileUrl });
  revalidatePath("/admin/connections", "layout");
  return { ok: `Đã thêm nick ${parsed.data.displayName}.` };
}

/**
 * Tạm dừng / bật lại một nick. Nick bị hạn chế (RESTRICTED, do extension báo checkpoint) chỉ quản trị viên bật lại được:
 * để người ta xem lại nick trước khi tiếp tục dùng.
 */
export async function setAccountStatusAction(accountId: string, status: "ACTIVE" | "PAUSED"): Promise<FbFormState> {
  const user = await requireFbManager();
  const account = await db.fbAccount.findUnique({ where: { id: accountId } });
  if (!account) return { error: "Không tìm thấy nick." };
  if (user.role !== "ADMIN" && account.userId !== user.id) return { error: "Đây không phải nick của bạn." };
  if (account.status === "RESTRICTED" && user.role !== "ADMIN") return { error: "Nick đang bị hạn chế, chỉ quản trị viên bật lại được." };

  await db.fbAccount.update({ where: { id: accountId }, data: { status } });
  await logActivity({ actor: user, action: "EXT_ACCOUNT_STATUS", target: account.displayName, detail: status === "ACTIVE" ? "Bật lại" : "Tạm dừng" });
  revalidatePath("/admin/connections", "layout");
  return { ok: status === "ACTIVE" ? "Đã bật lại nick." : "Đã tạm dừng nick." };
}

const tokenSchema = z.object({
  accountId: z.string().min(1, "Vui lòng chọn nick."),
  label: z.string().trim().min(1, "Vui lòng đặt tên cho máy này, ví dụ: Máy Lan, Chrome chính.").max(100),
});

/** Tạo mã kết nối. Mã gốc chỉ trả về MỘT lần ở đây; CSDL chỉ giữ bản băm. */
export async function createTokenAction(_prev: FbFormState, formData: FormData): Promise<FbFormState> {
  const user = await requireFbManager();
  const parsed = tokenSchema.safeParse({ accountId: formData.get("accountId"), label: formData.get("label") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const account = await db.fbAccount.findUnique({ where: { id: parsed.data.accountId } });
  if (!account) return { error: "Không tìm thấy nick." };
  if (user.role !== "ADMIN" && account.userId !== user.id) return { error: "Bạn chỉ tạo được mã cho nick của mình." };

  const t = generateExtToken();
  await db.extToken.create({
    data: { userId: account.userId, accountId: account.id, tokenHash: t.hash, tokenPrefix: t.prefix, label: parsed.data.label },
  });
  await logActivity({ actor: user, action: "EXT_TOKEN_CREATE", target: `${account.displayName} · ${parsed.data.label}`, detail: `Mã ${t.prefix}…` });
  revalidatePath("/admin/connections", "layout");
  return { ok: "Đã tạo mã kết nối. Hãy sao chép ngay, mã này sẽ không hiện lại.", token: t.token };
}

/** Thu hồi mã: extension dùng mã này sẽ nhận lỗi 401 ở lần gọi kế tiếp. */
export async function revokeTokenAction(tokenId: string): Promise<FbFormState> {
  const user = await requireFbManager();
  const token = await db.extToken.findUnique({ where: { id: tokenId }, include: { account: { select: { displayName: true } } } });
  if (!token) return { error: "Không tìm thấy mã." };
  if (user.role !== "ADMIN" && token.userId !== user.id) return { error: "Đây không phải mã của bạn." };
  if (token.revokedAt) return { ok: "Mã này đã được thu hồi trước đó." };

  await db.extToken.update({ where: { id: tokenId }, data: { revokedAt: new Date() } });
  await logActivity({ actor: user, action: "EXT_TOKEN_REVOKE", target: `${token.account.displayName} · ${token.label}`, detail: `Mã ${token.tokenPrefix}…` });
  revalidatePath("/admin/connections", "layout");
  return { ok: "Đã thu hồi mã. Extension dùng mã này sẽ ngừng hoạt động." };
}

/** Lưu cấu hình chạy của extension và các mốc thời gian (chỉ quản trị viên). */
export async function saveFbConfigAction(_prev: FbFormState, formData: FormData): Promise<FbFormState> {
  const user = await requireFbManager();
  if (user.role !== "ADMIN") return { error: "Chỉ quản trị viên sửa được cấu hình." };
  const parsed = fbConfigSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await saveFbConfig(parsed.data);
  revalidatePath("/admin/connections", "layout");
  return { ok: "Đã lưu cấu hình." };
}
