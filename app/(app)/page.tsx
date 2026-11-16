import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, PlusCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getQuotaInfo } from "@/lib/jobs/limits";
import { fileUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Trang chính" };

export default async function HomePage() {
  const user = await requireUser();
  const [sessions, quota] = await Promise.all([
    db.consultSession.findMany({
      where: { type: "CATALOG", ...(user.role === "ADMIN" ? {} : { createdById: user.id }) },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        logo: { include: { brand: { include: { customer: true } } } },
        createdBy: { select: { name: true } },
        images: { where: { retries: { none: {} } }, select: { status: true } },
      },
    }),
    getQuotaInfo(user),
  ]);
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Xin chào, {user.name}</h1>
        <p className="text-muted-foreground">
          Bắt đầu một phiên tư vấn mới hoặc xem lại các phiên gần đây.
          {quota && ` Hôm nay bạn còn ${quota.left}/${quota.limit} lượt tạo ảnh.`}
        </p>
      </div>

      <Link href="/sessions/new" className={buttonVariants({ size: "lg", className: "h-14 w-full text-base sm:w-auto sm:px-8" })}>
        <PlusCircleIcon className="size-5" />
        Tạo phiên tư vấn mới
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Phiên gần đây</CardTitle>
          <CardDescription>{sessions.length === 0 ? "Chưa có phiên nào." : `${sessions.length} phiên mới nhất.`}</CardDescription>
        </CardHeader>
        {sessions.length > 0 && (
          <CardContent>
            <ul className="flex flex-col gap-2">
              {sessions.map((s) => {
                const done = s.images.filter((i) => i.status === "SUCCESS").length;
                const failed = s.images.filter((i) => i.status === "FAILED").length;
                const running = s.images.length - done - failed;
                return (
                  <li key={s.id}>
                    <Link
                      href={`/sessions/${s.id}`}
                      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
                    >
                      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-white">
                        <img src={fileUrl(s.logo.normalizedPath)!} alt="" className="max-h-full max-w-full object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {s.logo.brand.name} <span className="font-normal text-muted-foreground">· {s.logo.brand.customer.name}</span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {fmt.format(s.createdAt)}
                          {user.role === "ADMIN" ? ` · ${s.createdBy.name}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1">
                        {running > 0 && <Badge variant="secondary">{running} đang tạo</Badge>}
                        {failed > 0 && <Badge variant="destructive">{failed} lỗi</Badge>}
                        <Badge>{done}/{s.images.length} xong</Badge>
                      </div>
                      <ChevronRightIcon className="size-4 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
