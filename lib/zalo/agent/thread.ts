import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { pendingAlive, type PendingPlan } from "./plan";
import { trimThread, type RefTable, type ThreadMsg } from "./protocol";

/**
 * Trí nhớ ngắn hạn của trợ lý Zalo (bảng zalo_assistant_threads, D129): mỗi nhân viên trong mỗi cuộc chat một mạch.
 * Nhờ nó bot hỏi lại rồi làm tiếp được, và nhớ việc đang chờ xác nhận.
 */

/** Để yên quá ngần này thì coi như chuyện mới: bỏ các lượt cũ và bảng mã tham chiếu. */
export const THREAD_IDLE_RESET_MS = 2 * 60 * 60_000;

export type ThreadState = RefTable & { messages: ThreadMsg[] };
export type Thread = { chatId: string; staffId: string; state: ThreadState; pending: PendingPlan | null };

const emptyState = (): ThreadState => ({ messages: [], refs: {}, seq: {} });

function readState(raw: unknown): ThreadState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyState();
  const o = raw as Partial<ThreadState>;
  const messages = Array.isArray(o.messages) ? o.messages.filter((m): m is ThreadMsg => !!m && typeof m === "object" && typeof m.c === "string" && (m.r === "u" || m.r === "a" || m.r === "t")) : [];
  const refs = o.refs && typeof o.refs === "object" && !Array.isArray(o.refs) ? o.refs : {};
  const seq = o.seq && typeof o.seq === "object" && !Array.isArray(o.seq) ? o.seq : {};
  return { messages, refs, seq };
}

export async function loadThread(chatId: string, staffId: string, now = Date.now()): Promise<Thread> {
  const row = await db.zaloAssistantThread.findUnique({ where: { chatId_staffId: { chatId, staffId } } });
  if (!row || now - row.updatedAt.getTime() > THREAD_IDLE_RESET_MS) return { chatId, staffId, state: emptyState(), pending: null };
  const pending = row.pending as unknown as PendingPlan | null;
  return { chatId, staffId, state: readState(row.state), pending: pendingAlive(pending, now) ? pending : null };
}

export async function saveThread(thread: Thread): Promise<void> {
  const state: ThreadState = { ...thread.state, messages: trimThread(thread.state.messages) };
  // cột JSON cho phép trống: Prisma bắt ghi rõ Prisma.DbNull chứ không nhận null trần
  const data = { state: state as unknown as Prisma.InputJsonValue, pending: thread.pending ? (thread.pending as unknown as Prisma.InputJsonValue) : Prisma.DbNull };
  await db.zaloAssistantThread.upsert({
    where: { chatId_staffId: { chatId: thread.chatId, staffId: thread.staffId } },
    create: { chatId: thread.chatId, staffId: thread.staffId, ...data },
    update: data,
  });
}

/**
 * Lệnh /reset của nhân viên (chỉ gõ được ở chat riêng với bot): quên mạch trò chuyện với trợ lý trong cuộc chat đó, và mọi
 * mạch của chính người này ở các nhóm (`staffId` = ZaloContact.id của họ), vì trong nhóm không gõ lệnh được.
 */
export async function resetThreads(chatId: string, staffId?: string): Promise<void> {
  await db.zaloAssistantThread.deleteMany({ where: staffId ? { OR: [{ chatId }, { staffId }] } : { chatId } });
}
