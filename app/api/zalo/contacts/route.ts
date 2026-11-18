import { apiUser, isResponse, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { getZaloSettings } from "@/lib/zalo/settings";

export type ContactItem = {
  id: string;
  name: string;
  isGroup: boolean;
  unread: number;
  needsHuman: boolean;
  botPaused: boolean;
  blocked: boolean;
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

  const rows = await db.zaloContact.findMany({
    where: {
      role: { in: filter === "blocked" ? ["BLOCKED"] : ["CUSTOMER"] },
      ...(q ? { displayName: { contains: q } } : {}),
      ...(filter === "unread" ? { unreadCount: { gt: 0 } } : {}),
      ...(filter === "waiting" ? { needsHuman: true } : {}),
      lastMessageAt: { not: null },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 150,
  });
  const items: ContactItem[] = rows.map((c) => ({
    id: c.id,
    name: c.displayName,
    isGroup: c.chatType === "GROUP",
    unread: c.unreadCount,
    needsHuman: c.needsHuman,
    botPaused: c.botPaused,
    blocked: c.role === "BLOCKED",
    lastText: c.lastMessageText,
    lastAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
  }));
  return Response.json({ contacts: items }, { headers: { "Cache-Control": "no-store" } });
}
