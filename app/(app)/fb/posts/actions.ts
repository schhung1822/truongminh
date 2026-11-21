"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireFbManager } from "@/lib/fb/access";
import { registerPost } from "@/lib/fb/register-post";
import { zonedStartOfDay } from "@/lib/time";

export type PostFormState = { error?: string; ok?: string };

const addSchema = z.object({
  url: z.string().trim().min(1, "Vui lòng dán link bài đăng.").max(600),
  accountId: z.string().min(1, "Vui lòng chọn nick đã đăng bài."),
  purpose: z.enum(["FIND_CUSTOMER", "FIND_SUPPLIER"], "Vui lòng chọn mục đích của bài."),
  content: z.string().max(20000).optional(),
  postedDate: z.string().optional(),
});

/**
 * Dán link một bài để theo dõi. Bắt buộc tick xác nhận "bài do chính nick này đăng": hệ thống chỉ đọc comment trên bài của mình,
 * và server không thể tự kiểm chứng điều đó, nên người đăng ký chịu trách nhiệm.
 */
export async function addPostAction(_prev: PostFormState, formData: FormData): Promise<PostFormState> {
  const user = await requireFbManager();
  if (formData.get("confirmOwn") !== "on") {
    return { error: "Hãy tick xác nhận: bài này do chính nick đã chọn đăng. Hệ thống chỉ đọc comment trên bài của mình." };
  }
  const parsed = addSchema.safeParse({
    url: formData.get("url"),
    accountId: formData.get("accountId"),
    purpose: formData.get("purpose"),
    content: formData.get("content") ?? undefined,
    postedDate: formData.get("postedDate") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const account = await db.fbAccount.findUnique({ where: { id: parsed.data.accountId }, select: { id: true, userId: true } });
  if (!account) return { error: "Không tìm thấy nick." };
  if (user.role !== "ADMIN" && account.userId !== user.id) return { error: "Bạn chỉ đăng ký được bài của nick mình." };

  const postedAt = parsed.data.postedDate ? zonedStartOfDay(parsed.data.postedDate, "Asia/Ho_Chi_Minh") : null;
  const r = await registerPost({
    url: parsed.data.url,
    accountId: account.id,
    purpose: parsed.data.purpose,
    registeredById: user.id,
    contentSnapshot: parsed.data.content,
    postedAt,
  });
  if (!r.ok) return { error: r.error };
  revalidatePath("/fb/posts");
  revalidatePath("/fb/groups");
  return { ok: r.created ? "Đã thêm bài vào danh sách theo dõi. Extension sẽ quét ở chu kỳ kế tiếp." : "Bài này đã có trong danh sách." };
}

/** Đổi mục đích của bài (quyết định lead sinh ra là khách hay bên sản xuất). Chỉ áp cho lead sinh ra từ lần quét sau. */
export async function setPurposeAction(postId: string, purpose: "FIND_CUSTOMER" | "FIND_SUPPLIER"): Promise<PostFormState> {
  const user = await requireFbManager();
  if (purpose !== "FIND_CUSTOMER" && purpose !== "FIND_SUPPLIER") return { error: "Mục đích không hợp lệ." };
  const post = await db.fbPost.findUnique({ where: { id: postId }, include: { account: { select: { userId: true } } } });
  if (!post) return { error: "Không tìm thấy bài." };
  if (user.role !== "ADMIN" && post.account.userId !== user.id) return { error: "Đây không phải bài của nick bạn." };

  await db.fbPost.update({ where: { id: postId }, data: { purpose } });
  revalidatePath("/fb/posts");
  return { ok: "Đã đổi mục đích của bài." };
}

export async function setTrackingAction(postId: string, status: "TRACKING" | "PAUSED" | "DONE"): Promise<PostFormState> {
  const user = await requireFbManager();
  const post = await db.fbPost.findUnique({ where: { id: postId }, include: { account: { select: { userId: true } } } });
  if (!post) return { error: "Không tìm thấy bài." };
  if (user.role !== "ADMIN" && post.account.userId !== user.id) return { error: "Đây không phải bài của nick bạn." };

  await db.fbPost.update({ where: { id: postId }, data: { trackingStatus: status } });
  revalidatePath("/fb/posts");
  return { ok: status === "TRACKING" ? "Đã tiếp tục theo dõi." : status === "PAUSED" ? "Đã tạm dừng theo dõi." : "Đã kết thúc theo dõi." };
}
