"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { canManageFb, canViewLead } from "@/lib/fb/access";
import { fmtDateTime } from "@/lib/fb/format";
import { normalizePhone } from "@/lib/fb/phone";

export type LeadActionResult = { error?: string; ok?: string };

const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST", "INVALID"] as const;

async function loadLead(leadId: string) {
  return db.fbLead.findUnique({
    where: { id: leadId },
    select: { id: true, phone: true, commentId: true, assignedToId: true, postId: true, sources: { select: { commentId: true } } },
  });
}

/** Cập nhật trạng thái và ghi chú: quản trị, marketing, hoặc sale được gán lead này. */
export async function updateLeadAction(leadId: string, input: { status: string; note: string }): Promise<LeadActionResult> {
  const user = await requireUser();
  const parsed = z.object({ status: z.enum(STATUSES, "Trạng thái không hợp lệ."), note: z.string().max(5000) }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const lead = await loadLead(leadId);
  if (!lead || !canViewLead(user, lead)) return { error: "Không tìm thấy lead." };

  await db.fbLead.update({ where: { id: leadId }, data: { status: parsed.data.status, note: parsed.data.note.trim() || null } });
  revalidatePath("/fb/leads");
  return { ok: "Đã lưu lead." };
}

/** Gán sale phụ trách: chỉ quản trị và marketing. */
export async function assignLeadAction(leadId: string, userId: string | null): Promise<LeadActionResult> {
  const user = await requireUser();
  if (!canManageFb(user.role)) return { error: "Chỉ quản trị viên và marketing gán được sale phụ trách." };
  const lead = await loadLead(leadId);
  if (!lead) return { error: "Không tìm thấy lead." };
  if (userId) {
    const target = await db.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true } });
    if (!target) return { error: "Không tìm thấy người dùng được chọn." };
  }
  await db.fbLead.update({ where: { id: leadId }, data: { assignedToId: userId } });
  revalidatePath("/fb/leads");
  return { ok: userId ? "Đã gán sale phụ trách." : "Đã bỏ gán." };
}

const idsSchema = z.array(z.string().min(1)).min(1, "Chưa chọn lead nào.").max(500, "Chọn tối đa 500 lead một lần.");

/** Đổi trạng thái nhiều lead cùng lúc. Sale chỉ đổi được lead gán cho mình. */
export async function bulkUpdateStatusAction(ids: string[], status: string): Promise<LeadActionResult> {
  const user = await requireUser();
  const parsed = z.object({ ids: idsSchema, status: z.enum(STATUSES, "Trạng thái không hợp lệ.") }).safeParse({ ids, status });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const where = canManageFb(user.role) ? { id: { in: parsed.data.ids } } : { id: { in: parsed.data.ids }, assignedToId: user.id };
  const result = await db.fbLead.updateMany({ where, data: { status: parsed.data.status } });
  revalidatePath("/fb/leads");
  if (result.count === 0) return { error: "Không đổi được lead nào (có thể không phải lead của bạn)." };
  return { ok: `Đã đổi trạng thái cho ${result.count} lead.` };
}

/** Gán sale phụ trách cho nhiều lead cùng lúc: chỉ quản trị và marketing. */
export async function bulkAssignAction(ids: string[], userId: string | null): Promise<LeadActionResult> {
  const user = await requireUser();
  if (!canManageFb(user.role)) return { error: "Chỉ quản trị viên và marketing gán được sale phụ trách." };
  const parsed = z.object({ ids: idsSchema }).safeParse({ ids });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (userId) {
    const target = await db.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true } });
    if (!target) return { error: "Không tìm thấy người dùng được chọn." };
  }
  const result = await db.fbLead.updateMany({ where: { id: { in: parsed.data.ids } }, data: { assignedToId: userId } });
  revalidatePath("/fb/leads");
  return { ok: userId ? `Đã gán ${result.count} lead.` : `Đã bỏ gán ${result.count} lead.` };
}

/** Gắn lead vào một khách hàng có sẵn (hoặc bỏ gắn). */
export async function linkCustomerAction(leadId: string, customerId: string | null): Promise<LeadActionResult> {
  const user = await requireUser();
  const lead = await loadLead(leadId);
  if (!lead || !canViewLead(user, lead)) return { error: "Không tìm thấy lead." };
  if (customerId && !(await db.customer.findUnique({ where: { id: customerId }, select: { id: true } }))) return { error: "Không tìm thấy khách hàng." };

  await db.fbLead.update({ where: { id: leadId }, data: { customerId } });
  revalidatePath("/fb/leads");
  return { ok: customerId ? "Đã gắn vào khách hàng." : "Đã bỏ gắn khách hàng." };
}

const SUPPLIER_STEPS = { called: "calledAt", zalo: "zaloMessagedAt", sample: "sampleSentAt" } as const;
export type SupplierStep = keyof typeof SUPPLIER_STEPS;

/**
 * Việc của sale với một nhà sản xuất (v1.1 mục 4.3): "Đã gọi", "Đã nhắn Zalo", "Đã gửi mẫu". Bấm lần nữa để bỏ đánh dấu.
 * Đánh dấu đã gọi / đã nhắn Zalo cho lead còn "Mới" thì lead chuyển sang "Đã liên hệ".
 */
export async function setSupplierStepAction(leadId: string, step: SupplierStep, on: boolean): Promise<LeadActionResult> {
  const user = await requireUser();
  if (!(step in SUPPLIER_STEPS)) return { error: "Việc không hợp lệ." };
  const lead = await db.fbLead.findUnique({ where: { id: leadId }, select: { id: true, assignedToId: true, status: true, leadType: true } });
  if (!lead || !canViewLead(user, lead)) return { error: "Không tìm thấy lead." };
  if (lead.leadType !== "SUPPLIER") return { error: "Chỉ áp dụng cho lead nhà sản xuất." };

  const advance = on && step !== "sample" && lead.status === "NEW";
  await db.fbLead.update({ where: { id: leadId }, data: { [SUPPLIER_STEPS[step]]: on ? new Date() : null, ...(advance ? { status: "CONTACTED" as const } : {}) } });
  revalidatePath("/fb/leads");
  const label = step === "called" ? "đã gọi" : step === "zalo" ? "đã nhắn Zalo" : "đã gửi mẫu";
  return { ok: on ? `Đã ghi nhận ${label}.${advance ? " Lead chuyển sang Đã liên hệ." : ""}` : `Đã bỏ đánh dấu ${label}.` };
}

/** Sửa tay loại nhà sản xuất (AI xếp có thể sai, hoặc AI đang tắt). */
export async function setSupplierTypeAction(leadId: string, supplierType: string): Promise<LeadActionResult> {
  const user = await requireUser();
  const parsed = z.enum(["MANUFACTURER", "BROKER", "UNKNOWN"], "Loại không hợp lệ.").safeParse(supplierType);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const lead = await db.fbLead.findUnique({ where: { id: leadId }, select: { id: true, assignedToId: true, leadType: true } });
  if (!lead || !canViewLead(user, lead)) return { error: "Không tìm thấy lead." };
  if (lead.leadType !== "SUPPLIER") return { error: "Chỉ áp dụng cho lead nhà sản xuất." };
  await db.fbLead.update({ where: { id: leadId }, data: { supplierType: parsed.data } });
  revalidatePath("/fb/leads");
  return { ok: "Đã đổi loại nhà sản xuất." };
}

export type LeadDetail = {
  sources: { authorName: string; text: string; timeText: string | null; postUrl: string; groupName: string | null; at: string }[];
  /** Khách hàng có số điện thoại trùng với lead (so sau khi chuẩn hoá); hệ thống chỉ gợi ý, người dùng tự bấm gắn. */
  suggestions: { id: string; name: string; phone: string | null }[];
};

export async function getLeadDetailAction(leadId: string): Promise<LeadDetail | { error: string }> {
  const user = await requireUser();
  const lead = await db.fbLead.findUnique({
    where: { id: leadId },
    select: {
      phone: true,
      assignedToId: true,
      sources: {
        orderBy: { createdAt: "asc" },
        select: { comment: { select: { authorName: true, text: true, timeText: true, createdAt: true, post: { select: { url: true, group: { select: { name: true } } } } } } },
      },
    },
  });
  if (!lead || !canViewLead(user, lead)) return { error: "Không tìm thấy lead." };

  let suggestions: LeadDetail["suggestions"] = [];
  if (lead.phone) {
    const customers = await db.customer.findMany({ where: { phone: { not: null } }, select: { id: true, name: true, phone: true }, take: 20000 });
    suggestions = customers.filter((c) => c.phone && normalizePhone(c.phone) === lead.phone).slice(0, 5);
  }
  return {
    sources: lead.sources.map((s) => ({
      authorName: s.comment.authorName,
      text: s.comment.text,
      timeText: s.comment.timeText,
      postUrl: s.comment.post.url,
      groupName: s.comment.post.group?.name ?? null,
      at: fmtDateTime(s.comment.createdAt),
    })),
    suggestions,
  };
}

/** Tìm khách hàng theo tên hoặc số điện thoại để gắn vào lead. */
export async function searchCustomersAction(q: string): Promise<{ id: string; name: string; phone: string | null }[]> {
  await requireUser();
  const term = q.trim();
  if (term.length < 2) return [];
  return db.customer.findMany({
    where: { OR: [{ name: { contains: term } }, { phone: { contains: term } }] },
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
    take: 8,
  });
}

/**
 * Xoá lead và các comment nguồn của nó (khi khách yêu cầu xoá dữ liệu, mục 11 của tài liệu thiết kế). Chỉ quản trị viên.
 * Xoá comment kéo theo lead và các dòng nguồn (khoá ngoại ON DELETE CASCADE), rồi tính lại bộ đếm của các bài liên quan.
 */
export async function deleteLeadAction(leadId: string): Promise<LeadActionResult> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { error: "Chỉ quản trị viên xoá được lead." };
  const lead = await loadLead(leadId);
  if (!lead) return { error: "Không tìm thấy lead." };

  const commentIds = [...new Set([lead.commentId, ...lead.sources.map((s) => s.commentId)])];
  const postIds = (await db.fbComment.findMany({ where: { id: { in: commentIds } }, select: { postId: true } })).map((c) => c.postId);
  await db.fbComment.deleteMany({ where: { id: { in: commentIds } } });
  for (const postId of new Set(postIds)) {
    const [commentCount, leadCount] = await Promise.all([db.fbComment.count({ where: { postId } }), db.fbLeadSource.count({ where: { comment: { postId } } })]);
    await db.fbPost.update({ where: { id: postId }, data: { commentCount, leadCount } });
  }
  revalidatePath("/fb/leads");
  return { ok: "Đã xoá lead và các comment liên quan." };
}
