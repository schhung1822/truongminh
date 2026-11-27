import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangleIcon, ExternalLinkIcon, ImageOffIcon, ImagesIcon, PlugZapIcon, SendIcon, TrendingUpIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getPinterestConfig } from "@/lib/env";
import { fmtAgo, fmtDateTime } from "@/lib/fb/format";
import { cn } from "@/lib/utils";
import { getZaloSettings } from "@/lib/zalo/settings";
import { BoardTechniqueSelect, BoardZaloFeedSwitch, DisconnectButton, SyncButton } from "./pinterest-client";

export const metadata: Metadata = { title: "Kết nối: Pinterest" };

type Params = { connected?: string; error?: string };

/** "45 giây", "2 phút", "1,5 phút". */
function fmtEvery(sec: number): string {
  return sec < 60 ? `${sec} giây` : `${(Math.round(sec / 6) / 10).toLocaleString("vi-VN")} phút`;
}

export default async function AdminPinterestPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const configured = !!getPinterestConfig();

  const [account, techniqueOptions, zalo, feedGroups] = await Promise.all([
    db.pinterestAccount.findFirst({
      include: {
        connectedBy: { select: { name: true } },
        boards: { orderBy: { name: "asc" }, include: { _count: { select: { pins: true } } } },
      },
    }),
    db.materialOption.findMany({ where: { type: "TECHNIQUE", isActive: true }, orderBy: { sortOrder: "asc" }, select: { value: true, label: true } }),
    getZaloSettings(),
    db.zaloGroup.findMany({ where: { isActive: true, pinFeed: true }, orderBy: { createdAt: "asc" }, select: { name: true } }),
  ]);

  // Gửi pin mới vào nhóm Zalo (D127): board nào đang theo dõi, đã đủ điều kiện chạy chưa, lần hỏi Pinterest gần nhất.
  const watchedBoards = account?.boards.filter((b) => b.zaloFeed) ?? [];
  const feedOn = zalo.enabled && zalo.pinFeed;
  const feedLabel = !feedOn ? "Đang tắt" : watchedBoards.length === 0 ? "Chưa chọn board" : feedGroups.length === 0 ? "Chưa có nhóm nhận" : "Đang chạy";
  const feedLastCheck = watchedBoards.reduce<Date | null>((latest, b) => (b.feedCheckedAt && (!latest || b.feedCheckedAt > latest) ? b.feedCheckedAt : latest), null);

  // Pin dùng làm ảnh phong cách tham khảo nhiều nhất (docs/DECISIONS.md D99), để chủ xưởng biết phong cách nào khách đang ưng.
  const topRefCounts = await db.generatedImageStyleRefPin.groupBy({
    by: ["pinId"],
    _count: { _all: true },
    orderBy: { _count: { pinId: "desc" } },
    take: 20,
  });
  const topRefPinsById = new Map(
    topRefCounts.length
      ? (
          await db.pinterestPin.findMany({
            where: { id: { in: topRefCounts.map((r) => r.pinId) } },
            select: { id: true, title: true, altText: true, sourceImageUrl: true, board: { select: { name: true } } },
          })
        ).map((p) => [p.id, p])
      : [],
  );
  const topRefPins = topRefCounts
    .map((r) => ({ count: r._count._all, pin: topRefPinsById.get(r.pinId) }))
    .filter((r): r is { count: number; pin: NonNullable<typeof r.pin> } => !!r.pin);

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Kết nối một tài khoản Pinterest của xưởng để dùng board/pin đã lưu làm ảnh mẫu gửi khách và ảnh phong cách tham khảo khi AI thiết kế (ở Bước 2). Chỉ quản trị viên kết nối được, mọi người đều xem và chọn được pin.
      </p>

      {params.error && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertDescription>{params.error}</AlertDescription>
        </Alert>
      )}
      {params.connected && !params.error && (
        <Alert>
          <AlertDescription>Đã kết nối Pinterest thành công. Bấm &quot;Đồng bộ ngay&quot; để tải board và pin về.</AlertDescription>
        </Alert>
      )}

      {!configured ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertDescription>
            Chưa cấu hình <code className="rounded bg-muted px-1 py-0.5">PINTEREST_CLIENT_ID</code> và{" "}
            <code className="rounded bg-muted px-1 py-0.5">PINTEREST_CLIENT_SECRET</code> trong file .env. Xem hướng dẫn trong{" "}
            <code className="rounded bg-muted px-1 py-0.5">.env.example</code>.
          </AlertDescription>
        </Alert>
      ) : !account ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <PlugZapIcon className="size-8 text-muted-foreground" />
            <p className="text-muted-foreground">Chưa kết nối tài khoản Pinterest nào.</p>
            <a href="/api/pinterest/oauth/start" className={buttonVariants()}>
              <PlugZapIcon /> Kết nối Pinterest
            </a>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                @{account.username}
                <Badge variant="secondary">Đã kết nối</Badge>
              </CardTitle>
              <CardDescription>
                Kết nối bởi {account.connectedBy.name} · {account.boards.length} board · Đồng bộ lần cuối:{" "}
                {account.lastSyncedAt ? fmtDateTime(account.lastSyncedAt) : "chưa đồng bộ"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              <SyncButton />
              <DisconnectButton />
              <Link href="/pinterest" className={buttonVariants({ variant: "outline" })}>
                <ImagesIcon /> Xem thư viện pin
              </Link>
              <a href={`https://www.pinterest.com/${account.username}/`} target="_blank" rel="noreferrer noopener" className={cn(buttonVariants({ variant: "ghost" }), "ml-auto")}>
                Mở trang Pinterest <ExternalLinkIcon />
              </a>
            </CardContent>
            {account.lastSyncError && (
              <CardContent>
                <Alert variant="destructive">
                  <AlertTriangleIcon />
                  <AlertDescription>Lần đồng bộ gần nhất lỗi: {account.lastSyncError}</AlertDescription>
                </Alert>
              </CardContent>
            )}
          </Card>

          {topRefPins.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUpIcon className="size-5" /> Pin dùng tham khảo nhiều nhất
                </CardTitle>
                <CardDescription>Pin được chọn làm ảnh phong cách khi thiết kế, nhiều lượt nhất trước — gợi ý phong cách khách đang ưng.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {topRefPins.map(({ count, pin }) => (
                    <li key={pin.id} className="flex items-center gap-3 rounded-lg border p-2">
                      <img src={pin.sourceImageUrl} alt={pin.title ?? pin.altText ?? "Pin"} className="size-12 shrink-0 rounded-md border object-cover" loading="lazy" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{pin.title || pin.altText || "Mẫu Pinterest"}</p>
                        <p className="text-xs text-muted-foreground">{pin.board.name}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {count} lượt
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <SendIcon className="size-5" /> Gửi pin mới vào nhóm Zalo
                <Badge variant={feedLabel === "Đang chạy" ? "default" : "secondary"}>{feedLabel}</Badge>
              </CardTitle>
              <CardDescription>
                Bật công tắc &quot;Gửi pin mới vào Zalo&quot; ở board bên dưới. Từ lúc đó, mỗi khi bạn lưu thêm ảnh vào board ấy trên Pinterest, bot Zalo gửi ảnh vào
                các nhóm đã bật &quot;Nhận mẫu Pinterest&quot;, thường trong vòng {fmtEvery(zalo.pinFeedIntervalSec)} sau khi lưu. Pin có sẵn trong board lúc bật không bị
                gửi lại.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <ul className="grid gap-2 sm:grid-cols-3">
                <li className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Board đang theo dõi</p>
                  <p className="font-medium">{watchedBoards.length === 0 ? "Chưa có" : watchedBoards.map((b) => b.name).join(", ")}</p>
                </li>
                <li className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Nhóm Zalo nhận mẫu</p>
                  <p className="font-medium">{feedGroups.length === 0 ? "Chưa có" : feedGroups.map((g) => g.name).join(", ")}</p>
                </li>
                <li className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Hỏi Pinterest mỗi {fmtEvery(zalo.pinFeedIntervalSec)}</p>
                  <p className="font-medium">{watchedBoards.length === 0 ? "Chưa chạy" : feedLastCheck ? `Lần gần nhất: ${fmtAgo(feedLastCheck)}` : "Chưa hỏi được lần nào"}</p>
                </li>
              </ul>
              {!feedOn && (
                <p className="text-muted-foreground">
                  {zalo.enabled ? "Công tắc \"Gửi mẫu Pinterest mới vào nhóm\" đang tắt." : "Zalo đang tắt (công tắc tổng ở Cài đặt Zalo > Tổng quan)."} Bật lại thì việc theo dõi bắt
                  đầu từ lúc bật; pin lưu trong lúc tắt không được gửi.
                </p>
              )}
              {account.feedError && (
                <Alert variant="destructive">
                  <AlertTriangleIcon />
                  <AlertDescription>Lần hỏi Pinterest gần nhất lỗi: {account.feedError}</AlertDescription>
                </Alert>
              )}
              <div>
                <Link href="/admin/zalo/groups" className={buttonVariants({ variant: "outline" })}>
                  Chọn nhóm nhận, chữ đi kèm, lịch sử gửi
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Board đã đồng bộ ({account.boards.length})</CardTitle>
              <CardDescription>
                Sale/thiết kế chọn pin trong các board này khi tạo lượt thiết kế ở Bước 2. Board nào bật &quot;Gửi pin mới vào Zalo&quot; thì pin lưu thêm vào đó được bot
                gửi vào nhóm.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {account.boards.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có board nào. Bấm &quot;Đồng bộ ngay&quot; ở trên.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {account.boards.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                        {b.coverImageUrl ? (
                          <img src={b.coverImageUrl} alt={b.name} className="size-full object-cover" loading="lazy" />
                        ) : (
                          <ImageOffIcon className="size-5 text-muted-foreground" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {b._count.pins} pin{b.privacy !== "PUBLIC" && ` · ${b.privacy === "SECRET" ? "Bí mật" : "Hạn chế"}`}
                        </p>
                        <BoardTechniqueSelect boardId={b.id} value={b.techniqueHint ?? ""} options={techniqueOptions} />
                        <BoardZaloFeedSwitch key={`${b.id}:${b.zaloFeed}`} boardId={b.id} boardName={b.name} checked={b.zaloFeed} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
