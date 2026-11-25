import type { Metadata } from "next";
import Link from "next/link";
import { CalendarIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { loadWizardData } from "@/lib/wizard-data";
import { NewSessionWizard } from "./sessions/new/wizard";

export const metadata: Metadata = { title: "Trang chính" };

const RECENT_LIMIT = 5;

/** 5 phiên gần nhất của chính người đang xem, kèm trạng thái ảnh, để biết việc hôm qua đã xong chưa mà không phải vào Lịch sử. */
async function loadRecentSessions(userId: string, timeZone: string) {
  const sessions = await db.consultSession.findMany({
    where: { createdById: userId },
    orderBy: { createdAt: "desc" },
    take: RECENT_LIMIT,
    include: {
      logo: { include: { brand: { include: { customer: true } } } },
      images: { where: { retries: { none: {} } }, select: { status: true } },
    },
  });
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone });
  return sessions.map((s) => {
    const done = s.images.filter((i) => i.status === "SUCCESS").length;
    const failed = s.images.filter((i) => i.status === "FAILED").length;
    const running = s.images.length - done - failed;
    return {
      id: s.id,
      type: s.type,
      createdAt: fmt.format(s.createdAt),
      customerName: s.logo.brand.customer.name,
      brandName: s.logo.brand.name,
      done,
      failed,
      running,
      total: s.images.length,
    };
  });
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ logoId?: string }> }) {
  const user = await requireUser();
  const { logoId } = await searchParams;
  const [wizard, recent] = await Promise.all([loadWizardData(user, logoId), loadRecentSessions(user.id, getEnv().APP_TIMEZONE)]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Xin chào, {user.name}</h1>
        <p className="text-muted-foreground">Tạo phiên tư vấn mới ngay bên dưới. Muốn xem lại các phiên cũ, vào mục Lịch sử.</p>
      </div>

      {recent.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="recent-title">
          <h2 id="recent-title" className="text-lg font-semibold">
            Phiên gần đây của bạn
          </h2>
          <ul className="flex flex-col gap-2">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/sessions/${s.id}`} className="block">
                  <Card className="py-2 transition-colors hover:bg-muted/50">
                    <CardContent className="flex flex-wrap items-center gap-3">
                      <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {s.customerName} <span className="text-muted-foreground">· {s.brandName}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.createdAt} · {s.type === "DESIGN" ? "Lượt thiết kế" : "Tạo ảnh mẫu"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {s.running > 0 && <Badge variant="secondary">{s.running} đang tạo</Badge>}
                        {s.failed > 0 && <Badge variant="destructive">{s.failed} lỗi</Badge>}
                        {s.running === 0 && (
                          <Badge variant={s.failed > 0 ? "secondary" : "default"}>
                            {s.done}/{s.total} ảnh xong
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="new-session-title">
        <h2 id="new-session-title" className="text-lg font-semibold">
          Tạo phiên tư vấn mới
        </h2>
        <NewSessionWizard
          customers={wizard.customers}
          initial={wizard.initial}
          sheets={wizard.sheets}
          quota={wizard.quota}
          showCost={wizard.showCost}
          imageModel={wizard.imageModel}
          auto={wizard.auto}
          isAdmin={user.role === "ADMIN"}
        />
      </section>
    </div>
  );
}
