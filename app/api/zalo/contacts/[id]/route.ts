import { apiUser, isResponse, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { getZaloSettings } from "@/lib/zalo/settings";

export type MessageItem = {
  id: string;
  direction: "IN" | "OUT";
  author: "CONTACT" | "BOT" | "HUMAN" | "SYSTEM";
  kind: string;
  text: string | null;
  mediaUrl: string | null;
  failed: boolean;
  error: string | null;
  at: string;
  byName: string | null;
};

/** Tin nhắn của một hội thoại (150 tin mới nhất, cũ → mới). Có ?read=1 thì đánh dấu đã đọc. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (isResponse(user)) return user;
  const s = await getZaloSettings();
  if (!s.enabled || !s.inbox) return jsonError(403, "Hộp thư Zalo đang tắt.");

  const { id } = await ctx.params;
  const contact = await db.zaloContact.findUnique({ where: { id } });
  if (!contact) return jsonError(404, "Không tìm thấy hội thoại.");

  if (new URL(req.url).searchParams.get("read") === "1" && contact.unreadCount > 0) {
    await db.zaloContact.update({ where: { id }, data: { unreadCount: 0 } });
  }

  const rows = await db.zaloMessage.findMany({ where: { contactId: id }, orderBy: { createdAt: "desc" }, take: 150 });
  const userIds = [...new Set(rows.map((r) => r.authorUserId).filter((x): x is string => !!x))];
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));

  const messages: MessageItem[] = rows.reverse().map((r) => ({
    id: r.id,
    direction: r.direction,
    author: r.author,
    kind: r.kind,
    text: r.text,
    mediaUrl: r.mediaPath ? `/api/files/${r.mediaPath.split("/").map(encodeURIComponent).join("/")}` : null,
    failed: r.failed,
    error: r.error,
    at: r.createdAt.toISOString(),
    byName: r.authorUserId ? (names.get(r.authorUserId) ?? null) : null,
  }));

  return Response.json(
    {
      contact: {
        id: contact.id,
        name: contact.displayName,
        isGroup: contact.chatType === "GROUP",
        botPaused: contact.botPaused,
        needsHuman: contact.needsHuman,
        blocked: contact.role === "BLOCKED",
      },
      messages,
      features: { chatbot: s.chatbot, aiDraft: s.aiDraft },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
