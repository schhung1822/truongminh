import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { fmtAgo, fmtDateTime } from "@/lib/fb/format";
import { zaloWebhookUrl } from "@/lib/zalo";
import { getZaloSettings } from "@/lib/zalo/settings";
import { AccountsBoard, type AccountRow } from "./accounts-board";
import { BotsBoard, type BotRow } from "./bots-board";

export const metadata: Metadata = { title: "Kết nối: Zalo" };

export default async function ZaloConnectionPage() {
  await requireAdmin();
  const env = getEnv();
  const [settings, dbBots, envGroups, envContacts, accountRows] = await Promise.all([
    getZaloSettings(),
    db.zaloBot.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { groups: true, contacts: true } } } }),
    db.zaloGroup.count({ where: { botId: null } }),
    db.zaloContact.count({ where: { botId: null, accountId: null } }), // hội thoại của tài khoản cá nhân không tính cho bot
    db.zaloAccount.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { contacts: true } } } }),
  ]);

  const bots: BotRow[] = [];
  if (env.ZALO_BOT_TOKEN) {
    bots.push({
      id: null,
      name: "Bot trong file .env",
      accountName: null,
      tokenHint: env.ZALO_BOT_TOKEN.slice(-4),
      isActive: true,
      canJoinGroups: null,
      groups: envGroups,
      contacts: envContacts,
      webhookUrl: zaloWebhookUrl(null),
      webhookReady: !!env.ZALO_WEBHOOK_SECRET,
      webhookSetAt: null,
      lastChecked: null,
      lastError: null,
    });
  }
  for (const b of dbBots) {
    bots.push({
      id: b.id,
      name: b.name,
      accountName: b.accountName,
      tokenHint: b.tokenHint,
      isActive: b.isActive,
      canJoinGroups: b.canJoinGroups,
      groups: b._count.groups,
      contacts: b._count.contacts,
      webhookUrl: zaloWebhookUrl(b.id),
      webhookReady: true,
      webhookSetAt: b.webhookSetAt ? fmtDateTime(b.webhookSetAt) : null,
      lastChecked: b.lastCheckedAt ? fmtAgo(b.lastCheckedAt) : null,
      lastError: b.lastError,
    });
  }

  const accounts: AccountRow[] = accountRows.map((a) => ({
    id: a.id,
    name: a.name,
    phone: a.phone,
    avatarUrl: a.avatarUrl,
    status: a.status,
    lastError: a.lastError,
    lastConnectedAt: a.lastConnectedAt ? a.lastConnectedAt.toISOString() : null,
    autoConnect: a.autoConnect,
    contacts: a._count.contacts,
  }));

  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Trang này chỉ lo việc kết nối: bot nào, tài khoản nào đang nối với hệ thống. Bật/tắt Zalo và cấu hình từng chức năng (gửi ảnh vào nhóm, trợ lý AI, nhân viên và lệnh, chăm sóc nhóm) vẫn ở{" "}
        <Link href="/admin/zalo" className="underline underline-offset-4">
          Cài đặt Zalo
        </Link>
        .
      </p>

      {!settings.enabled && (
        <p className="rounded-lg border border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          Zalo đang tắt (công tắc tổng ở{" "}
          <Link href="/admin/zalo" className="underline underline-offset-4">
            Cài đặt Zalo &gt; Tổng quan
          </Link>
          ). Bot đã kết nối vẫn được giữ nhưng chưa gửi, chưa nhận tin cho tới khi bật.
        </p>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="zalo-bots">
        <h2 id="zalo-bots" className="text-lg font-semibold">
          Bot Zalo
        </h2>
        <BotsBoard bots={bots} isHttps={env.APP_URL.startsWith("https://")} />
      </section>

      <section className="flex scroll-mt-20 flex-col gap-3" id="tai-khoan-ca-nhan" aria-labelledby="zalo-personal">
        <h2 id="zalo-personal" className="text-lg font-semibold">
          Tài khoản Zalo cá nhân
        </h2>
        <AccountsBoard accounts={accounts} />
      </section>
    </div>
  );
}
