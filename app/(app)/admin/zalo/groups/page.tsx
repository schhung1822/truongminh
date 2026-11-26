import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { isZaloConfigured } from "@/lib/zalo";
import { getZaloSettings } from "@/lib/zalo/settings";
import { GroupsSettings } from "../groups-settings";
import { GroupsBoard, type BotOption } from "../zalo-board";

export const metadata: Metadata = { title: "Zalo: nhóm và gửi ảnh" };

export default async function ZaloGroupsPage() {
  await requireAdmin();
  const env = getEnv();
  const [settings, configured, bots, groups, deliveries] = await Promise.all([
    getZaloSettings(),
    isZaloConfigured(),
    db.zaloBot.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, isActive: true } }),
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
  // Lựa chọn bot cho từng nhóm: dòng đầu (rỗng) là bot trong .env, hoặc "tự chọn" khi .env không có token.
  const botOptions: BotOption[] = [
    { value: "", label: env.ZALO_BOT_TOKEN ? "Bot trong file .env" : "Tự chọn (bot kết nối sớm nhất)" },
    ...bots.map((b) => ({ value: b.id, label: b.isActive ? b.name : `${b.name} (đang tắt)` })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <GroupsSettings initial={settings} tokenSet={configured} />

      <Card>
        <CardHeader>
          <CardTitle>Nhóm Zalo</CardTitle>
          <CardDescription>
            Nhóm hiện ở đây khi bot nhận được tin từ nhóm (có người trả lời tin của bot hoặc gõ @tên bot, cần bật webhook), hoặc khi bạn
            thêm bằng tay. Đặt tên nhóm ở đây để bot lấy làm tên khách khi nhân viên tag bot ra lệnh. Ảnh chỉ vào nhóm khi nhân viên tag bot giao việc hoặc khi gửi tay từ Hộp thư.
            {botOptions.length > 1 && " Khi có nhiều bot, cột Bot cho biết tin vào nhóm đi qua bot nào: nhóm tự nhận đã gắn sẵn đúng bot, nhóm thêm tay thì chọn bot đang ở trong nhóm."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GroupsBoard
            tokenSet={configured}
            bots={botOptions}
            groups={groups.map((g) => ({
              id: g.id,
              chatId: g.chatId,
              name: g.name,
              isActive: g.isActive,
              lastSeen: g.lastSeenAt ? fmt.format(g.lastSeenAt) : null,
              botId: g.botId ?? "",
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
