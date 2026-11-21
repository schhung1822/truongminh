"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireFbManager } from "@/lib/fb/access";
import { canonicalGroupUrl, groupNameFromUrl } from "@/lib/fb/urls";

export type GroupFormState = { error?: string; ok?: string };

const fields = {
  name: z.string().trim().max(200),
  topic: z.string().trim().max(150),
  purpose: z.enum(["FIND_CUSTOMER", "FIND_SUPPLIER", "BOTH"], "Vui lòng chọn mục đích của nhóm."),
  notes: z.string().trim().max(5000),
};

const createSchema = z.object({ url: z.string().trim().min(1, "Vui lòng dán link nhóm.").max(300), ...fields });
const updateSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên nhóm.").max(200),
  topic: fields.topic,
  purpose: fields.purpose,
  notes: fields.notes,
  status: z.enum(["ACTIVE", "PAUSED", "BANNED"], "Trạng thái không hợp lệ."),
});

export async function createGroupAction(_prev: GroupFormState, formData: FormData): Promise<GroupFormState> {
  await requireFbManager();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const url = canonicalGroupUrl(parsed.data.url);
  if (!url) return { error: "Link nhóm không hợp lệ. Dán link dạng facebook.com/groups/..." };
  if (await db.fbGroup.findUnique({ where: { url }, select: { id: true } })) return { error: "Nhóm này đã có trong danh sách." };

  await db.fbGroup.create({
    data: {
      url,
      name: parsed.data.name || groupNameFromUrl(url),
      topic: parsed.data.topic || null,
      purpose: parsed.data.purpose,
      notes: parsed.data.notes || null,
    },
  });
  revalidatePath("/fb/groups");
  return { ok: "Đã thêm nhóm." };
}

export async function updateGroupAction(groupId: string, _prev: GroupFormState, formData: FormData): Promise<GroupFormState> {
  await requireFbManager();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await db.fbGroup.findUnique({ where: { id: groupId }, select: { id: true } }))) return { error: "Không tìm thấy nhóm." };

  await db.fbGroup.update({
    where: { id: groupId },
    data: { name: parsed.data.name, topic: parsed.data.topic || null, purpose: parsed.data.purpose, notes: parsed.data.notes || null, status: parsed.data.status },
  });
  revalidatePath("/fb/groups");
  return { ok: "Đã lưu nhóm." };
}
