import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getZaloSettings } from "@/lib/zalo/settings";
import type { ContactItem } from "@/app/api/zalo/contacts/route";
import { Inbox } from "./inbox";

export const metadata: Metadata = { title: "Hộp thư Zalo" };

export default async function ZaloInboxPage() {
  const user = await requireUser();
  const s = await getZaloSettings();

  if (!s.enabled || !s.inbox) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Hộp thư Zalo</h1>
        <p className="text-muted-foreground">
          Hộp thư Zalo đang tắt.{" "}
          {user.role === "ADMIN" ? (
            <>
              Bật ở <Link href="/admin/zalo" className="underline">Quản trị &gt; Zalo</Link>.
            </>
          ) : (
            "Báo quản trị viên nếu cần dùng."
          )}
        </p>
      </div>
    );
  }

  const rows = await db.zaloContact.findMany({
    where: { role: "CUSTOMER", lastMessageAt: { not: null } },
    orderBy: { lastMessageAt: "desc" },
    take: 150,
  });
  const initial: ContactItem[] = rows.map((c) => ({
    id: c.id,
    name: c.displayName,
    isGroup: c.chatType === "GROUP",
    unread: c.unreadCount,
    needsHuman: c.needsHuman,
    botPaused: c.botPaused,
    blocked: false,
    lastText: c.lastMessageText,
    lastAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Hộp thư Zalo</h1>
        <p className="text-muted-foreground">Tin khách nhắn bot Zalo. Trả lời ở đây, bot tạm dừng để bạn tiếp quản; bấm &quot;Trả lại cho bot&quot; khi xong.</p>
      </div>
      <Inbox initial={initial} />
    </div>
  );
}
