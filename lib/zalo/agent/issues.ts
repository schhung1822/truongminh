import "server-only";
import { db } from "@/lib/db";
import { ISSUE_KINDS, summarizeIssues, type IssueKind } from "./issue-kinds";

/**
 * Ghi và đọc nhật ký sự cố của trợ lý Zalo (bảng zalo_assistant_issues, docs/DECISIONS.md D130).
 * Nơi ghi nằm trên đường xử lý lỗi nên logIssue KHÔNG BAO GIỜ ném lỗi: CSDL hỏng thì chỉ còn dòng trong nhật ký máy chủ.
 */

export const ISSUE_KEEP_DAYS = 180;
const PRUNE_EVERY_MS = 24 * 3600_000;
const g = globalThis as unknown as { __zaloIssuePrunedAt?: number };

export type IssueInput = {
  kind: IssueKind;
  chatId: string;
  isGroup: boolean;
  /** tên nhóm đã biết; bỏ trống (undefined) thì tự tra theo chatId, null = biết là chưa đặt tên */
  chatName?: string | null;
  staffName?: string | null;
  command?: string | null;
  detail?: string | null;
  tool?: string | null;
  model?: string | null;
};

const cut = (v: string | null | undefined, max: number) => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};

export async function logIssue(input: IssueInput): Promise<void> {
  try {
    let chatName = input.chatName;
    if (chatName === undefined && input.isGroup) {
      const group = await db.zaloGroup.findUnique({ where: { chatId: input.chatId }, select: { name: true } });
      chatName = group && !/^Nhóm mới/.test(group.name) ? group.name : null;
    }
    await db.zaloAssistantIssue.create({
      data: {
        kind: input.kind,
        visible: ISSUE_KINDS[input.kind].visible,
        chatId: input.chatId,
        isGroup: input.isGroup,
        chatName: cut(chatName, 150),
        staffName: cut(input.staffName, 150),
        command: cut(input.command, 1500),
        detail: cut(input.detail, 2000),
        tool: cut(input.tool, 40),
        model: cut(input.model, 100),
      },
    });
    // dọn dòng quá cũ, mỗi ngày nhiều nhất một lần cho mỗi tiến trình
    if (Date.now() - (g.__zaloIssuePrunedAt ?? 0) > PRUNE_EVERY_MS) {
      g.__zaloIssuePrunedAt = Date.now();
      await db.zaloAssistantIssue.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - ISSUE_KEEP_DAYS * 86400_000) } } });
    }
  } catch (e) {
    console.error("Zalo agent: không ghi được nhật ký sự cố:", e instanceof Error ? e.message.replace(/\s+/g, " ").slice(0, 300) : e);
  }
}

export type IssueRow = {
  id: string;
  kind: string;
  visible: boolean;
  isGroup: boolean;
  chatName: string | null;
  staffName: string | null;
  command: string | null;
  detail: string | null;
  tool: string | null;
  model: string | null;
  createdAt: Date;
};

export type IssueReport = {
  days: number;
  total: number;
  /** số lần người ra lệnh nhận câu báo lỗi */
  visible: number;
  byKind: ReturnType<typeof summarizeIssues>;
  recent: IssueRow[];
};

/** Sự cố trong `days` ngày gần nhất: số lần theo loại và `take` dòng mới nhất. */
export async function loadIssueReport(days = 30, take = 40): Promise<IssueReport> {
  const since = new Date(Date.now() - days * 86400_000);
  const [groups, recent] = await Promise.all([
    db.zaloAssistantIssue.groupBy({ by: ["kind"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.zaloAssistantIssue.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, kind: true, visible: true, isGroup: true, chatName: true, staffName: true, command: true, detail: true, tool: true, model: true, createdAt: true },
    }),
  ]);
  const byKind = summarizeIssues(groups.map((x) => ({ kind: x.kind, count: x._count._all })));
  return {
    days,
    total: byKind.reduce((n, k) => n + k.count, 0),
    visible: byKind.filter((k) => k.visible).reduce((n, k) => n + k.count, 0),
    byKind,
    recent,
  };
}
