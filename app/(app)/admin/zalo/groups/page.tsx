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
import { GroupsBoard, PinDeliveryRetryButton, type BotOption } from "../zalo-board";

export const metadata: Metadata = { title: "Zalo: nhóm và gửi ảnh" };

export default async function ZaloGroupsPage() {
  await requireAdmin();
  const env = getEnv();
  const [settings, configured, bots, groups, deliveries, pinDeliveries] = await Promise.all([
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
    // Mẫu Pinterest mới gửi vào nhóm (D127): lượt đang chờ, đã gửi, lỗi
    db.pinterestPinDelivery.findMany({
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: {
        id: true,
        status: true,
        error: true,
        updatedAt: true,
        group: { select: { name: true } },
        pin: { select: { title: true, altText: true, sourceImageUrl: true, board: { select: { name: true } } } },
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
            thêm bằng tay. Đặt tên nhóm ở đây để bot lấy làm tên khách khi nhân viên tag bot ra lệnh. Ảnh mẫu chỉ vào nhóm khi nhân viên tag bot giao việc hoặc khi gửi tay từ Hộp thư.
            Bật cột &quot;Nhận mẫu Pinterest&quot; cho nhóm nào thì nhóm đó nhận ảnh mới lưu vào các board Pinterest đang theo dõi.
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
              pinFeed: g.pinFeed,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mẫu Pinterest gửi vào nhóm (30 lượt gần nhất)</CardTitle>
          <CardDescription>Mỗi ảnh mới lưu vào board đang theo dõi được gửi vào mỗi nhóm nhận mẫu một lần. Lượt lỗi có thể bấm gửi lại.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {pinDeliveries.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Chưa gửi mẫu Pinterest nào.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Mẫu</TableHead>
                  <TableHead>Nhóm</TableHead>
                  <TableHead>Kết quả</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pinDeliveries.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="whitespace-nowrap">{fmt.format(d.updatedAt)}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <img src={d.pin.sourceImageUrl} alt="" className="size-10 shrink-0 rounded-md border object-cover" loading="lazy" />
                        <span className="min-w-0">
                          <span className="block max-w-56 truncate text-sm">{d.pin.title || d.pin.altText || "Mẫu Pinterest"}</span>
                          <span className="block text-xs text-muted-foreground">{d.pin.board.name}</span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>{d.group.name}</TableCell>
                    <TableCell>
                      {d.status === "SENT" ? (
                        <Badge>Đã gửi</Badge>
                      ) : d.status === "PENDING" ? (
                        <Badge variant="secondary">Đang chờ gửi</Badge>
                      ) : (
                        <span className="flex flex-col items-start gap-1">
                          <Badge variant="destructive">Lỗi</Badge>
                          <span className="max-w-md text-xs text-muted-foreground">{d.error}</span>
                          <PinDeliveryRetryButton id={d.id} />
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

      <Card>
        <CardHeader>
          <CardTitle>Ảnh mẫu gửi vào nhóm (30 lần gần nhất)</CardTitle>
          <CardDescription>Ảnh mẫu tạo trong hệ thống (tag bot giao việc, gửi tay từ Hộp thư): ảnh nào đã gửi vào nhóm nào và lý do khi lỗi.</CardDescription>
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
