import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangleIcon, ExternalLinkIcon, ImageOffIcon, ImagesIcon, PlugZapIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getPinterestConfig } from "@/lib/env";
import { fmtDateTime } from "@/lib/fb/format";
import { cn } from "@/lib/utils";
import { DisconnectButton, SyncButton } from "./pinterest-client";

export const metadata: Metadata = { title: "Pinterest" };

type Params = { connected?: string; error?: string };

export default async function AdminPinterestPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const configured = !!getPinterestConfig();

  const account = await db.pinterestAccount.findFirst({
    include: {
      connectedBy: { select: { name: true } },
      boards: { orderBy: { name: "asc" }, include: { _count: { select: { pins: true } } } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Pinterest</h1>
        <p className="text-muted-foreground">
          Kết nối một tài khoản Pinterest của xưởng để dùng board/pin đã lưu làm ảnh mẫu gửi khách và ảnh phong cách tham khảo khi AI thiết kế (ở Bước 2). Chỉ quản trị viên kết nối được, mọi người đều xem và chọn được pin.
        </p>
      </div>

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

          <Card>
            <CardHeader>
              <CardTitle>Board đã đồng bộ ({account.boards.length})</CardTitle>
              <CardDescription>Sale/thiết kế chọn pin trong các board này khi tạo lượt thiết kế ở Bước 2.</CardDescription>
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
                      <div className="min-w-0">
                        <p className="truncate font-medium">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {b._count.pins} pin{b.privacy !== "PUBLIC" && ` · ${b.privacy === "SECRET" ? "Bí mật" : "Hạn chế"}`}
                        </p>
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
