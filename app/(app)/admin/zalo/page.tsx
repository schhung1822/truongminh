import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { DailyBars } from "@/components/stats/daily-bars";
import { getZaloSettings } from "@/lib/zalo/settings";
import { loadZaloStats } from "@/lib/zalo/stats";
import { ConnectionCard, GroupsBoard } from "./zalo-board";
import { ZaloFeatures } from "./zalo-features";
import { PairingBoard } from "./zalo-pairing";

export const metadata: Metadata = { title: "Zalo" };

export default async function ZaloAdminPage() {
  await requireAdmin();
  const env = getEnv();
  const [settings, stats, pairing, staff, groups, deliveries] = await Promise.all([
    getZaloSettings(),
    loadZaloStats(),
    db.zaloContact.findMany({ where: { role: "CUSTOMER", pairCode: { not: null } }, orderBy: { pairRequestedAt: "desc" } }),
    db.zaloContact.findMany({ where: { role: "STAFF" }, orderBy: { displayName: "asc" } }),
    db.zaloGroup.findMany({ orderBy: { createdAt: "asc" } }),
    db.zaloDelivery.findMany({
      orderBy: { updatedAt: "desc" },
      take: 30,
      include: {
        group: { select: { name: true } },
        image: { select: { session: { select: { logo: { select: { brand: { select: { name: true } } } } } } } },
      },
    }),
  ]);
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium" });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Zalo</h1>
        <p className="text-muted-foreground">
          Bot Zalo: gửi ảnh mẫu vào nhóm, Hộp thư trả lời khách, bot AI của kie.ai, ghép nối và lệnh gõ nhanh cho nhân viên. Mỗi chức năng bật/tắt riêng.
        </p>
      </div>

      <ConnectionCard
        tokenSet={!!env.ZALO_BOT_TOKEN}
        secretSet={!!env.ZALO_WEBHOOK_SECRET}
        webhookUrl={`${env.APP_URL.replace(/\/$/, "")}/api/webhooks/zalo`}
        isHttps={env.APP_URL.startsWith("https://")}
      />

      <ZaloFeatures initial={settings} tokenSet={!!env.ZALO_BOT_TOKEN} />

      <Card>
        <CardHeader>
          <CardTitle>Ghép nối nhân viên</CardTitle>
          <CardDescription>Cho nhân viên dùng lệnh gõ nhanh trên Zalo (xem tình hình, token, số lượt tạo ảnh).</CardDescription>
        </CardHeader>
        <CardContent>
          <PairingBoard
            enabled={settings.pairing}
            pending={pairing.map((p) => ({ id: p.id, name: p.displayName, requestedAt: p.pairRequestedAt ? fmt.format(p.pairRequestedAt) : null }))}
            staff={staff.map((s) => ({ id: s.id, name: s.displayName }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thống kê Zalo</CardTitle>
          <CardDescription>Tin nhắn 7 ngày gần nhất, và lượt bot AI trả lời 30 ngày.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {[
              ["Khách (chat riêng)", stats.customers],
              ["Nhóm", stats.groups],
              ["Nhân viên", stats.staff],
              ["Chưa đọc", stats.unread],
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
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-500" /> Nhân viên trả lời</span>
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
                { value: d.human, className: "bg-emerald-500" },
              ],
              title: d.day + ": khách " + d.incoming + ", bot " + d.bot + ", nhân viên " + d.human,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nhóm Zalo</CardTitle>
          <CardDescription>
            Nhóm hiện ở đây khi bot nhận được tin từ nhóm (có người trả lời tin của bot hoặc gõ @tên bot, cần bật webhook), hoặc khi bạn
            thêm bằng tay. Nhóm mới luôn ở chế độ KHÔNG tự động gửi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GroupsBoard
            tokenSet={!!env.ZALO_BOT_TOKEN}
            groups={groups.map((g) => ({
              id: g.id,
              chatId: g.chatId,
              name: g.name,
              isActive: g.isActive,
              autoSend: g.autoSend,
              lastSeen: g.lastSeenAt ? fmt.format(g.lastSeenAt) : null,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>30 lần gửi gần nhất</CardTitle>
          <CardDescription>Để xem ảnh nào đã gửi vào nhóm nào và lý do khi lỗi.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {deliveries.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Chưa gửi ảnh nào.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Nhóm</TableHead>
                  <TableHead>Thương hiệu</TableHead>
                  <TableHead>Kết quả</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="whitespace-nowrap">{fmt.format(d.updatedAt)}</TableCell>
                    <TableCell>{d.group.name}</TableCell>
                    <TableCell>{d.image.session.logo.brand.name}</TableCell>
                    <TableCell>
                      {d.status === "SENT" ? (
                        <Badge>Đã gửi</Badge>
                      ) : (
                        <span className="flex flex-col gap-1">
                          <Badge variant="destructive" className="self-start">
                            Lỗi
                          </Badge>
                          <span className="max-w-md text-xs text-muted-foreground">{d.error}</span>
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
