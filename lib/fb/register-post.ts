import "server-only";
import type { FbPostPurpose } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { ensureGroup } from "./groups";
import { canonicalGroupUrl, parsePostUrl } from "./urls";

export type RegisterPostInput = {
  url: string;
  accountId: string;
  purpose: FbPostPurpose;
  registeredById: string;
  contentSnapshot?: string | null;
  postedAt?: Date | null;
  /** Link nhóm do người dùng/extension báo, dùng khi link bài không cho biết nhóm (ví dụ link chia sẻ rút gọn). */
  groupUrl?: string | null;
  /** v1.1, bài tìm nhà sản xuất: sản phẩm đang tìm xưởng và các chất liệu (materials.id) gợi ý cho sản phẩm đó. */
  productRef?: string | null;
  suggestedMaterialIds?: string[];
};

export type RegisterPostResult = { ok: true; postId: string; created: boolean } | { ok: false; error: string };

/**
 * Đưa một bài vào danh sách theo dõi (dùng cho cả trang web và API của extension). Nick được chọn là nick dùng để mở
 * và quét bài; bài có thể do người khác đăng. Hàm này bảo đảm link đúng dạng, không trùng và nick tồn tại.
 * Đã có bài cùng link của cùng nick thì trả về bài đó (created=false), khác nick thì từ chối.
 */
export async function registerPost(input: RegisterPostInput): Promise<RegisterPostResult> {
  const parsed = parsePostUrl(input.url);
  if (!parsed) return { ok: false, error: "Link không phải link bài đăng Facebook. Dán link bài (permalink), ví dụ facebook.com/groups/.../posts/..." };

  const account = await db.fbAccount.findUnique({ where: { id: input.accountId }, select: { id: true } });
  if (!account) return { ok: false, error: "Không tìm thấy nick Facebook." };

  const existing = await db.fbPost.findUnique({ where: { url: parsed.url }, select: { id: true, accountId: true } });
  if (existing) {
    return existing.accountId === input.accountId
      ? { ok: true, postId: existing.id, created: false }
      : { ok: false, error: "Bài này đã được đăng ký cho một nick khác." };
  }

  const groupUrl = parsed.groupUrl ?? (input.groupUrl ? canonicalGroupUrl(input.groupUrl) : null);
  const groupId = groupUrl ? await ensureGroup(groupUrl) : null;
  const post = await db.fbPost.create({
    data: {
      accountId: input.accountId,
      groupId,
      url: parsed.url,
      purpose: input.purpose,
      contentSnapshot: input.contentSnapshot?.trim() ? input.contentSnapshot.trim().slice(0, 20000) : null,
      postedAt: input.postedAt ?? null,
      registeredById: input.registeredById,
      ...(input.purpose === "FIND_SUPPLIER"
        ? { productRef: input.productRef?.trim().slice(0, 200) || null, ...(input.suggestedMaterialIds?.length ? { suggestedMaterialIds: input.suggestedMaterialIds } : {}) }
        : {}),
    },
    select: { id: true },
  });
  return { ok: true, postId: post.id, created: true };
}
