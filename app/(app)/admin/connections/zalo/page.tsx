import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { fmtAgo, fmtDateTime } from "@/lib/fb/format";
import { dayKey } from "@/lib/time";
import { zaloWebhookUrl } from "@/lib/zalo";
import { getZaloSettings } from "@/lib/zalo/settings";
import { botKeyOf, loadBotUsage, type BotUsage } from "@/lib/zalo/usage";
import { AccountsBoard, type AccountRow } from "./accounts-board";
import { BotsBoard, type BotRow } from "./bots-board";

export const metadata: Metadata = { title: "Kết nối: Zalo" };

export default async function ZaloConnectionPage() {
  await requireAdmin();
  const env = getEnv();
  const [settings, dbBots, envGroups, accountRows, usage, peopleRows, staffRows] = await Promise.all([
    getZaloSettings(),
    db.zaloBot.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { groups: true } } } }),
    db.zaloGroup.count({ where: { botId: null } }),
    db.zaloAccount.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { contacts: true } } } }),
    loadBotUsage(),
    // người đã nhắn riêng với từng bot (hội thoại của tài khoản Zalo cá nhân không tính cho bot)
    db.zaloContact.groupBy({ by: ["botId"], where: { chatType: "PRIVATE", accountId: null }, _count: { _all: true } }),
    db.zaloContact.findMany({
      where: { role: "STAFF", chatType: "PRIVATE", accountId: null },
      orderBy: { displayName: "asc" },
      select: { botId: true, displayName: true, user: { select: { name: true } } },
    }),
  ]);
  const people = new Map(peopleRows.map((r) => [r.botId, r._count._all]));
  const staffOf = (botId: string | null) => [...new Set(staffRows.filter((s) => s.botId === botId).map((s) => s.user?.name ?? s.displayName))];
  const usageOf = (botId: string | null): BotRow["usage"] => {
    const u: BotUsage | undefined = usage.get(botKeyOf(botId));
    if (!u) return { sent: 0, since: null, quotaHit: null };
    // bắt đầu đếm sau ngày 1 của tháng thì số tháng này chưa đủ: ghi rõ đếm từ ngày nào
    const day = u.since ? dayKey(u.since, env.APP_TIMEZONE) : null; // "2026-11-28"
    const startedLate = day !== null && Number(day.slice(8, 10)) > 1;
    return { sent: u.sent, since: startedLate ? `${day.slice(8, 10)}/${day.slice(5, 7)}` : null, quotaHit: u.quotaHitAt ? fmtDateTime(u.quotaHitAt) : null };
  };

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
      people: people.get(null) ?? 0,
      staff: staffOf(null),
      usage: usageOf(null),
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
      people: people.get(b.id) ?? 0,
      staff: staffOf(b.id),
      usage: usageOf(b.id),
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
        Trang này chỉ lo việc kết nối: bot nào, tài khoản nào đang nối với hệ thống. Bật/tắt Zalo và cấu hình từng chức năng (gửi ảnh vào nhóm, trợ lý AI, nhân viên và quyền dùng bot, chăm sóc nhóm) vẫn ở{" "}
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
