"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireFbManager } from "@/lib/fb/access";
import { fbReplyConfigSchema, saveFbReplyConfig } from "@/lib/fb/reply-config";
import { DEFAULT_TEMPLATES, isTemplateKind, unknownVars } from "@/lib/fb/reply-text";
import { canonicalPageUrl } from "@/lib/fb/urls";

export type FormState = { error?: string; ok?: string };

function done(result: FormState): FormState {
  revalidatePath("/fb/templates");
  revalidatePath("/fb/replies");
  return result;
}

/* ---------- Fanpage ---------- */

const pageSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên fanpage đúng như hiện trên Facebook.").max(150),
  url: z.string().trim().min(1, "Vui lòng dán link fanpage.").max(300),
});

/**
 * Thêm fanpage dùng để trả lời comment (v1.1 mục 3.1). Tên phải đúng tên hiển thị trên Facebook: extension tìm fanpage trong danh
 * sách chuyển danh tính theo tên này. Fanpage đầu tiên tự thành mặc định.
 */
export async function createPageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireFbManager();
  const parsed = pageSchema.safeParse({ name: formData.get("name"), url: formData.get("url") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const url = canonicalPageUrl(parsed.data.url);
  if (!url) return { error: "Link fanpage không hợp lệ. Dán link dạng facebook.com/ten.trang hoặc facebook.com/profile.php?id=..." };
  if (await db.fbPage.findUnique({ where: { url }, select: { id: true } })) return { error: "Fanpage này đã có trong danh sách." };
  const first = (await db.fbPage.count()) === 0;
  await db.fbPage.create({ data: { name: parsed.data.name, url, isDefault: first } });
  return done({ ok: `Đã thêm fanpage ${parsed.data.name}.${first ? " Đây là fanpage mặc định cho câu mời nhà sản xuất." : ""}` });
}

export async function renamePageAction(pageId: string, name: string): Promise<FormState> {
  await requireFbManager();
  const clean = name.trim();
  if (!clean || clean.length > 150) return { error: "Tên fanpage không hợp lệ." };
  if (!(await db.fbPage.findUnique({ where: { id: pageId }, select: { id: true } }))) return { error: "Không tìm thấy fanpage." };
  await db.fbPage.update({ where: { id: pageId }, data: { name: clean } });
  return done({ ok: "Đã đổi tên fanpage." });
}

/** Đặt fanpage mặc định cho luồng mời nhà sản xuất. Chỉ một fanpage là mặc định. */
export async function setDefaultPageAction(pageId: string): Promise<FormState> {
  await requireFbManager();
  const page = await db.fbPage.findUnique({ where: { id: pageId }, select: { status: true, name: true } });
  if (!page) return { error: "Không tìm thấy fanpage." };
  if (page.status !== "ACTIVE") return { error: "Fanpage đang tạm dừng, bật lại trước khi đặt làm mặc định." };
  await db.$transaction([db.fbPage.updateMany({ where: { isDefault: true }, data: { isDefault: false } }), db.fbPage.update({ where: { id: pageId }, data: { isDefault: true } })]);
  return done({ ok: `${page.name} là fanpage mặc định. Câu mời soạn từ giờ sẽ đứng tên fanpage này.` });
}

export async function setPageStatusAction(pageId: string, status: "ACTIVE" | "PAUSED"): Promise<FormState> {
  await requireFbManager();
  if (status !== "ACTIVE" && status !== "PAUSED") return { error: "Trạng thái không hợp lệ." };
  if (!(await db.fbPage.findUnique({ where: { id: pageId }, select: { id: true } }))) return { error: "Không tìm thấy fanpage." };
  await db.fbPage.update({ where: { id: pageId }, data: { status } });
  return done({ ok: status === "ACTIVE" ? "Đã bật lại fanpage." : "Đã tạm dừng fanpage. Câu đứng tên fanpage này sẽ không được giao cho extension." });
}

/** Gỡ fanpage. Các câu chưa gửi đang đứng tên fanpage này được bỏ qua (kèm lý do) để không treo trong hàng chờ. */
export async function deletePageAction(pageId: string): Promise<FormState> {
  const user = await requireFbManager();
  if (user.role !== "ADMIN") return { error: "Chỉ quản trị viên gỡ được fanpage." };
  const page = await db.fbPage.findUnique({ where: { id: pageId }, select: { name: true } });
  if (!page) return { error: "Không tìm thấy fanpage." };
  await db.$transaction([
    db.fbReplyQueue.updateMany({ where: { pageId, status: { in: ["DRAFT", "APPROVED"] } }, data: { status: "SKIPPED", failReason: "page_deleted" } }),
    db.fbPage.delete({ where: { id: pageId } }),
  ]);
  return done({ ok: `Đã gỡ fanpage ${page.name}.` });
}

/* ---------- Cấu hình luồng trả lời ---------- */

export async function saveReplyConfigAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireFbManager();
  if (user.role !== "ADMIN") return { error: "Chỉ quản trị viên sửa được cấu hình." };
  const parsed = fbReplyConfigSchema.safeParse({
    supplierAiEnabled: formData.get("supplierAiEnabled") === "on",
    offerCooldownDays: formData.get("offerCooldownDays"),
    fallbackWhenPageUnavailable: formData.get("fallbackWhenPageUnavailable"),
    replyInterestEnabled: formData.get("replyInterestEnabled") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await saveFbReplyConfig(parsed.data);
  return done({ ok: "Đã lưu cấu hình. Áp dụng cho comment quét được từ lúc này." });
}

/* ---------- Mẫu câu ---------- */

const templateSchema = z.object({
  kind: z.string().min(1, "Vui lòng chọn loại câu."),
  text: z.string().trim().min(10, "Mẫu câu quá ngắn.").max(1000, "Mẫu câu tối đa 1000 ký tự."),
});

function checkTemplateText(text: string): string | null {
  const bad = unknownVars(text);
  if (bad.length > 0) return `Biến không đúng: ${bad.map((b) => `{${b}}`).join(", ")}. Chỉ dùng {ten} {ten_page} {link_page} {san_pham} {vat_lieu_goi_y}.`;
  return null;
}

export async function createTemplateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireFbManager();
  const parsed = templateSchema.safeParse({ kind: formData.get("kind"), text: formData.get("text") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [purpose, category] = parsed.data.kind.split(":");
  if (!isTemplateKind(purpose, category)) return { error: "Loại câu không hợp lệ." };
  const problem = checkTemplateText(parsed.data.text);
  if (problem) return { error: problem };
  await db.fbReplyTemplate.create({ data: { purpose: purpose as "FIND_CUSTOMER" | "FIND_SUPPLIER", category: category as "INTEREST" | "QUESTION" | "SUPPLIER_OFFER", text: parsed.data.text } });
  return done({ ok: "Đã thêm mẫu câu." });
}

export async function updateTemplateAction(templateId: string, text: string): Promise<FormState> {
  await requireFbManager();
  const clean = text.trim();
  if (clean.length < 10 || clean.length > 1000) return { error: "Mẫu câu dài từ 10 đến 1000 ký tự." };
  const problem = checkTemplateText(clean);
  if (problem) return { error: problem };
  if (!(await db.fbReplyTemplate.findUnique({ where: { id: templateId }, select: { id: true } }))) return { error: "Không tìm thấy mẫu câu." };
  await db.fbReplyTemplate.update({ where: { id: templateId }, data: { text: clean } });
  return done({ ok: "Đã lưu mẫu câu. Áp dụng cho câu soạn từ lúc này." });
}

export async function setTemplateActiveAction(templateId: string, active: boolean): Promise<FormState> {
  await requireFbManager();
  if (!(await db.fbReplyTemplate.findUnique({ where: { id: templateId }, select: { id: true } }))) return { error: "Không tìm thấy mẫu câu." };
  await db.fbReplyTemplate.update({ where: { id: templateId }, data: { active } });
  return done({ ok: active ? "Đã bật mẫu câu." : "Đã tắt mẫu câu." });
}

export async function deleteTemplateAction(templateId: string): Promise<FormState> {
  await requireFbManager();
  if (!(await db.fbReplyTemplate.findUnique({ where: { id: templateId }, select: { id: true } }))) return { error: "Không tìm thấy mẫu câu." };
  await db.fbReplyTemplate.delete({ where: { id: templateId } });
  return done({ ok: "Đã xóa mẫu câu." });
}

/** Nạp các mẫu có sẵn của một loại câu vào CSDL để sửa. Chỉ nạp khi loại đó chưa có mẫu nào. */
export async function seedTemplatesAction(kind: string): Promise<FormState> {
  await requireFbManager();
  const [purpose, category] = kind.split(":");
  if (!isTemplateKind(purpose, category)) return { error: "Loại câu không hợp lệ." };
  const where = { purpose: purpose as "FIND_CUSTOMER" | "FIND_SUPPLIER", category: category as "INTEREST" | "QUESTION" | "SUPPLIER_OFFER" };
  if ((await db.fbReplyTemplate.count({ where })) > 0) return { error: "Loại câu này đã có mẫu." };
  const defaults = DEFAULT_TEMPLATES.filter((t) => t.purpose === purpose && t.category === category);
  // tạo lần lượt để ngày tạo khác nhau: thứ tự xoay vòng mẫu dựa vào ngày tạo
  for (const [i, t] of defaults.entries()) await db.fbReplyTemplate.create({ data: { ...where, text: t.text, createdAt: new Date(Date.now() + i) } });
  return done({ ok: `Đã nạp ${defaults.length} mẫu có sẵn. Sửa lại cho đúng giọng của xưởng.` });
}
