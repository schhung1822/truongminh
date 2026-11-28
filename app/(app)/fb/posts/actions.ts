"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requireFbManager } from "@/lib/fb/access";
import { parseMaterialIds } from "@/lib/fb/offer-rules";
import { registerPost } from "@/lib/fb/register-post";
import { zonedStartOfDay } from "@/lib/time";

export type PostFormState = { error?: string; ok?: string };

const addSchema = z.object({
  url: z.string().trim().min(1, "Vui lòng dán link bài đăng.").max(600),
  accountId: z.string().min(1, "Vui lòng chọn nick dùng để quét bài."),
  purpose: z.enum(["FIND_CUSTOMER", "FIND_SUPPLIER"], "Vui lòng chọn mục đích của bài."),
  content: z.string().max(20000).optional(),
  postedDate: z.string().optional(),
  productRef: z.string().trim().max(200, "Tên sản phẩm tối đa 200 ký tự.").optional(),
});

/** Ô chọn vật liệu gửi lên một chuỗi JSON các mã chất liệu; chỉ giữ mã còn tồn tại và đang bật, đúng thứ tự người dùng chọn. */
async function readMaterialIds(raw: FormDataEntryValue | string | null): Promise<string[]> {
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(typeof raw === "string" && raw ? raw : "[]");
  } catch {
    /* chuỗi hỏng: coi như không chọn */
  }
  const ids = parseMaterialIds(parsed);
  if (ids.length === 0) return [];
  const found = new Set((await db.material.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } })).map((m) => m.id));
  return ids.filter((id) => found.has(id));
}

/** Dán permalink một bài để nick Facebook đã kết nối mở và quét comment mà nick đó nhìn thấy. */
export async function addPostAction(_prev: PostFormState, formData: FormData): Promise<PostFormState> {
  const user = await requireFbManager();
  const parsed = addSchema.safeParse({
    url: formData.get("url"),
    accountId: formData.get("accountId"),
    purpose: formData.get("purpose"),
    content: formData.get("content") ?? undefined,
    postedDate: formData.get("postedDate") ?? undefined,
    productRef: formData.get("productRef") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const account = await db.fbAccount.findUnique({ where: { id: parsed.data.accountId }, select: { id: true, userId: true } });
  if (!account) return { error: "Không tìm thấy nick." };
  if (user.role !== "ADMIN" && account.userId !== user.id) return { error: "Bạn chỉ được dùng nick Facebook đã kết nối cho tài khoản của mình." };

  const postedAt = parsed.data.postedDate ? zonedStartOfDay(parsed.data.postedDate, "Asia/Ho_Chi_Minh") : null;
  const r = await registerPost({
    url: parsed.data.url,
    accountId: account.id,
    purpose: parsed.data.purpose,
    registeredById: user.id,
    contentSnapshot: parsed.data.content,
    postedAt,
    productRef: parsed.data.productRef,
    suggestedMaterialIds: parsed.data.purpose === "FIND_SUPPLIER" ? await readMaterialIds(formData.get("materialIds")) : [],
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
  if (user.role !== "ADMIN" && post.account.userId !== user.id) return { error: "Bài này không thuộc danh sách theo dõi của bạn." };

  await db.fbPost.update({ where: { id: postId }, data: { purpose } });
  revalidatePath("/fb/posts");
  return { ok: "Đã đổi mục đích của bài." };
}

/**
 * Sản phẩm và vật liệu gợi ý của một bài tìm nhà sản xuất (v1.1 mục 6, trang Đăng bài). Câu mời soạn SAU lúc lưu mới dùng
 * giá trị mới; câu đã nằm trong hàng chờ giữ nguyên.
 */
export async function setPostOfferAction(postId: string, input: { productRef: string; materialIds: string[] }): Promise<PostFormState> {
  const user = await requireFbManager();
  const productRef = (input.productRef ?? "").trim();
  if (productRef.length > 200) return { error: "Tên sản phẩm tối đa 200 ký tự." };
  const post = await db.fbPost.findUnique({ where: { id: postId }, include: { account: { select: { userId: true } } } });
  if (!post) return { error: "Không tìm thấy bài." };
  if (user.role !== "ADMIN" && post.account.userId !== user.id) return { error: "Bài này không thuộc danh sách theo dõi của bạn." };

  const ids = await readMaterialIds(JSON.stringify(Array.isArray(input.materialIds) ? input.materialIds : []));
  await db.fbPost.update({ where: { id: postId }, data: { productRef: productRef || null, suggestedMaterialIds: ids.length > 0 ? ids : Prisma.DbNull } });
  revalidatePath("/fb/posts");
  return { ok: "Đã lưu sản phẩm và vật liệu gợi ý. Áp dụng cho câu mời soạn từ lúc này." };
}

export async function setTrackingAction(postId: string, status: "TRACKING" | "PAUSED" | "DONE"): Promise<PostFormState> {
  const user = await requireFbManager();
  const post = await db.fbPost.findUnique({ where: { id: postId }, include: { account: { select: { userId: true } } } });
  if (!post) return { error: "Không tìm thấy bài." };
  if (user.role !== "ADMIN" && post.account.userId !== user.id) return { error: "Bài này không thuộc danh sách theo dõi của bạn." };

  await db.fbPost.update({ where: { id: postId }, data: { trackingStatus: status } });
  revalidatePath("/fb/posts");
  return { ok: status === "TRACKING" ? "Đã tiếp tục theo dõi." : status === "PAUSED" ? "Đã tạm dừng theo dõi." : "Đã kết thúc theo dõi." };
}
