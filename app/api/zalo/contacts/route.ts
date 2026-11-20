import { apiUser, isResponse, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { getZaloSettings } from "@/lib/zalo/settings";

export type AccountOption = { id: string; name: string; status: "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "LOGGED_OUT"; unread: number };

export type ContactItem = {
  id: string;
  name: string;
  isGroup: boolean;
  unread: number;
  needsHuman: boolean;
  botPaused: boolean;
  blocked: boolean;
  /** tài khoản Zalo cá nhân sở hữu hội thoại (null = hội thoại của bot) */
  accountId: string | null;
  accountName: string | null;
  lastText: string | null;
  lastAt: string | null;
};

/** Danh sách hội thoại của Hộp thư Zalo (mới nhất trước). Dùng cho trang Hộp thư, tự làm mới vài giây một lần. */
export async function GET(req: Request) {
  const user = await apiUser();
  if (isResponse(user)) return user;
  const s = await getZaloSettings();
  if (!s.enabled || !s.inbox) return jsonError(403, "Hộp thư Zalo đang tắt.");

  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const filter = sp.get("filter");
  // ?account=bot: chỉ hội thoại của bot; ?account=<id>: chỉ hội thoại của một tài khoản cá nhân
  const account = (sp.get("account") ?? "").trim();

  const rows = await db.zaloContact.findMany({
    where: {
      role: { in: filter === "blocked" ? ["BLOCKED"] : ["CUSTOMER"] },
      ...(q ? { displayName: { contains: q } } : {}),
      ...(filter === "unread" ? { unreadCount: { gt: 0 } } : {}),
      ...(filter === "waiting" ? { needsHuman: true } : {}),
      lastMessageAt: { not: null },
      ...(account === "bot" ? { accountId: null } : account ? { accountId: account } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    take: 150,
    include: { account: { select: { name: true } } },
  });
  const items: ContactItem[] = rows.map((c) => ({
    id: c.id,
    name: c.displayName,
    isGroup: c.chatType === "GROUP",
    unread: c.unreadCount,
    needsHuman: c.needsHuman,
    botPaused: c.botPaused,
    blocked: c.role === "BLOCKED",
    accountId: c.accountId,
    accountName: c.account?.name ?? null,
    lastText: c.lastMessageText,
    lastAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
  }));
  const accountRows = await db.zaloAccount.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, status: true } });
  const unread = await db.zaloContact.groupBy({ by: ["accountId"], where: { role: "CUSTOMER", unreadCount: { gt: 0 } }, _sum: { unreadCount: true } });
  const unreadBy = new Map(unread.map((u) => [u.accountId, u._sum.unreadCount ?? 0]));
  const accounts: AccountOption[] = accountRows.map((a) => ({ id: a.id, name: a.name, status: a.status, unread: unreadBy.get(a.id) ?? 0 }));
  return Response.json({ contacts: items, accounts }, { headers: { "Cache-Control": "no-store" } });
}
