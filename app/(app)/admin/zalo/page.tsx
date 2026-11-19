import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DailyBars } from "@/components/stats/daily-bars";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getZaloSettings, type ZaloSettings } from "@/lib/zalo/settings";
import { loadZaloStats } from "@/lib/zalo/stats";
import { CleanupCard, MasterSwitch } from "./overview-cards";
import { ConnectionCard } from "./zalo-board";

export const metadata: Metadata = { title: "Cài đặt Zalo" };

type Row = { label: string; on: boolean; href: string; tab: string };

function featureRows(s: ZaloSettings): Row[] {
  return [
    { label: "Gửi ảnh vào nhóm", on: s.groupSend, href: "/admin/zalo/groups", tab: "Nhóm và gửi ảnh" },
    { label: "Bot AI trả lời khách", on: s.chatbot, href: "/admin/zalo/bot", tab: "Bot AI và trả lời" },
    { label: "Lời chào khách mới", on: s.welcome, href: "/admin/zalo/bot", tab: "Bot AI và trả lời" },
    { label: "Trả lời nhanh theo từ khóa", on: s.quickReplies, href: "/admin/zalo/bot", tab: "Bot AI và trả lời" },
    { label: "Giờ làm việc", on: s.hoursEnabled, href: "/admin/zalo/bot", tab: "Bot AI và trả lời" },
    { label: "Báo nhân viên khi khách cần người", on: s.staffNotify, href: "/admin/zalo/bot", tab: "Bot AI và trả lời" },
    { label: "Ghép nối nhân viên", on: s.pairing, href: "/admin/zalo/staff", tab: "Nhân viên và lệnh" },
    { label: "Lệnh gõ nhanh", on: s.commands, href: "/admin/zalo/staff", tab: "Nhân viên và lệnh" },
    { label: "Kịch bản chăm sóc nhóm", on: s.care, href: "/admin/zalo/care", tab: "Chăm sóc nhóm" },
  ];
}

export default async function ZaloAdminPage() {
  await requireAdmin();
  const env = getEnv();
  const [settings, stats, messages] = await Promise.all([getZaloSettings(), loadZaloStats(), db.zaloMessage.count()]);

  return (
    <div className="flex flex-col gap-6">
      <ConnectionCard
        tokenSet={!!env.ZALO_BOT_TOKEN}
        secretSet={!!env.ZALO_WEBHOOK_SECRET}
        webhookUrl={`${env.APP_URL.replace(/\/$/, "")}/api/webhooks/zalo`}
        isHttps={env.APP_URL.startsWith("https://")}
      />

      <MasterSwitch enabled={settings.enabled} tokenSet={!!env.ZALO_BOT_TOKEN} />

      <Card>
        <CardHeader>
          <CardTitle>Các chức năng và nơi cấu hình</CardTitle>
          <CardDescription>
            Bấm vào tên mục để sang trang cấu hình chức năng đó. Chưa rõ chức năng làm gì thì xem{" "}
            <Link href="/zalo/guide" className="underline">Hướng dẫn Zalo</Link>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {featureRows(settings).map((r) => (
              <li key={r.label} className="flex items-center gap-3 rounded-lg border p-3">
                <Badge variant={r.on && settings.enabled ? "default" : "secondary"}>{r.on ? (settings.enabled ? "Đang bật" : "Bật (Zalo tắt)") : "Tắt"}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.label}</span>
                  <Link href={r.href} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                    Cấu hình ở: {r.tab}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thống kê Zalo</CardTitle>
          <CardDescription>Tin nhắn 7 ngày gần nhất, và lượt bot AI trả lời 30 ngày. Tin nhắn chỉ được lưu khi bật Bot AI.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              ["Khách (chat riêng)", stats.customers],
              ["Nhóm", stats.groups],
              ["Nhân viên", stats.staff],
              ["Chờ nhân viên", stats.waiting],
              ["Bot đã trả lời (30 ngày)", stats.botReplies30],
              ["Token bot dùng (30 ngày)", stats.promptTokens30 + stats.completionTokens30],
              ["Ảnh gửi nhóm (7 ngày)", stats.imagesSent7],
            ].map(([label, value]) => (
              <li key={String(label)} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-semibold tabular-nums">{Number(value).toLocaleString("vi-VN")}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary" /> Khách nhắn</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-amber-400" /> Bot trả lời</span>
            {stats.botFailed30 > 0 && <span className="text-red-600">Bot lỗi 30 ngày: {stats.botFailed30}</span>}
            {stats.imagesFailed7 > 0 && <span className="text-red-600">Gửi ảnh lỗi 7 ngày: {stats.imagesFailed7}</span>}
          </div>
          <DailyBars
            format={(n) => String(Math.round(n))}
            bars={stats.daily.map((d) => ({
              label: d.day.slice(8, 10) + "/" + d.day.slice(5, 7),
              segments: [
                { value: d.incoming, className: "bg-primary" },
                { value: d.bot, className: "bg-amber-400" },
              ],
              title: d.day + ": khách " + d.incoming + ", bot " + d.bot,
            }))}
          />
        </CardContent>
      </Card>

      <CleanupCard messages={messages} />
    </div>
  );
}
