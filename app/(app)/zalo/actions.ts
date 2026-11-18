"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { draftReply, sendHumanReply, sendSessionToContact, type SessionSendMode } from "@/lib/zalo/inbox";
import { getZaloSettings } from "@/lib/zalo/settings";

type Result = { error?: string; ok?: string };

async function requireInbox() {
  const user = await requireUser();
  const s = await getZaloSettings();
  if (!s.enabled || !s.inbox) throw new Error("Hộp thư Zalo đang tắt.");
  return { user, settings: s };
}

function fail(e: unknown): Result {
  return { error: e instanceof Error ? e.message : "Có lỗi không xác định." };
}

export async function sendReplyAction(contactId: string, text: string): Promise<Result> {
  try {
    const { user } = await requireInbox();
    const r = await sendHumanReply(user, contactId, text);
    return r.ok ? { ok: "Đã gửi." } : { error: r.error };
  } catch (e) {
    return fail(e);
  }
}

export async function draftReplyAction(contactId: string): Promise<Result & { text?: string }> {
  try {
    await requireInbox();
    const r = await draftReply(contactId);
    return r.ok ? { text: r.text } : { error: r.error };
  } catch (e) {
    return fail(e);
  }
}

/** Tiếp quản (bot im) hoặc trả lại cho bot. */
export async function setBotPausedAction(contactId: string, paused: boolean): Promise<Result> {
  try {
    await requireInbox();
    await db.zaloContact.update({ where: { id: contactId }, data: { botPaused: paused, ...(paused ? {} : { needsHuman: false }) } });
    return { ok: paused ? "Bot đã tạm dừng ở hội thoại này." : "Đã trả lại cho bot." };
  } catch (e) {
    return fail(e);
  }
}

/** Đánh dấu đã xử lý xong (bỏ cờ "chờ nhân viên"). */
export async function markHandledAction(contactId: string): Promise<Result> {
  try {
    await requireInbox();
    await db.zaloContact.update({ where: { id: contactId }, data: { needsHuman: false, unreadCount: 0 } });
    return { ok: "Đã đánh dấu xử lý xong." };
  } catch (e) {
    return fail(e);
  }
}

/** Chặn hoặc bỏ chặn: người bị chặn vẫn nhắn được nhưng bot không trả lời và tin không vào Hộp thư. */
export async function setBlockedAction(contactId: string, blocked: boolean): Promise<Result> {
  try {
    await requireInbox();
    await db.zaloContact.updateMany({
      where: { id: contactId, role: blocked ? "CUSTOMER" : "BLOCKED" },
      data: { role: blocked ? "BLOCKED" : "CUSTOMER", ...(blocked ? { botPaused: true } : {}) },
    });
    return { ok: blocked ? "Đã chặn." : "Đã bỏ chặn." };
  } catch (e) {
    return fail(e);
  }
}

export type SessionChoice = { id: string; title: string; subtitle: string; images: number };

/** Danh sách phiên để chọn gửi cho khách (mới nhất trước, lọc theo tên thương hiệu/khách). */
export async function listSessionsForSendAction(query: string): Promise<{ sessions: SessionChoice[]; error?: string }> {
  try {
    await requireInbox();
    const q = z.string().trim().max(100).parse(query);
    const rows = await db.consultSession.findMany({
      where: q
        ? { OR: [{ logo: { brand: { name: { contains: q } } } }, { logo: { brand: { customer: { name: { contains: q } } } } }] }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        logo: { include: { brand: { include: { customer: true } } } },
        _count: { select: { images: { where: { status: "SUCCESS", retries: { none: {} } } } } },
      },
    });
    const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
    return {
      sessions: rows
        .filter((r) => r._count.images > 0)
        .map((r) => ({
          id: r.id,
          title: r.logo.brand.name,
          subtitle: `${r.logo.brand.customer.name} · ${r.type === "DESIGN" ? "Thiết kế" : "Catalog"} · ${fmt.format(r.createdAt)}`,
          images: r._count.images,
        })),
    };
  } catch (e) {
    return { sessions: [], ...fail(e) };
  }
}

export async function sendSessionAction(contactId: string, sessionId: string, mode: SessionSendMode): Promise<Result> {
  try {
    const { user } = await requireInbox();
    if (!["images", "pdf", "zip"].includes(mode)) return { error: "Cách gửi không hợp lệ." };
    const r = await sendSessionToContact(user, contactId, sessionId, mode);
    if (!r.ok) return { error: r.error };
    return { ok: mode === "images" ? `Đã gửi ${r.sent} ảnh.` : "Đã gửi file." };
  } catch (e) {
    return fail(e);
  }
}
