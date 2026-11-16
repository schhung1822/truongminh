import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderTile, TileGrid } from "@/components/folder-ui";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { loadWizardData } from "@/lib/wizard-data";
import { NewSessionWizard } from "./sessions/new/wizard";

export const metadata: Metadata = { title: "Trang chính" };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ logoId?: string }> }) {
  const user = await requireUser();
  const { logoId } = await searchParams;

  const [wizard, sessions] = await Promise.all([
    loadWizardData(user, logoId),
    db.consultSession.findMany({
      where: { type: "CATALOG", ...(user.role === "ADMIN" ? {} : { createdById: user.id }) },
      orderBy: { createdAt: "desc" },
      take: 18,
      include: {
        logo: { include: { brand: { include: { customer: true } } } },
        createdBy: { select: { name: true } },
        images: { where: { retries: { none: {} } }, select: { status: true } },
      },
    }),
  ]);
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Xin chào, {user.name}</h1>
        <p className="text-muted-foreground">Tạo phiên tư vấn mới ngay bên dưới, hoặc mở lại các phiên gần đây.</p>
      </div>

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
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Phiên gần đây</CardTitle>
          <CardDescription>
            {sessions.length === 0 ? "Chưa có phiên nào." : `${sessions.length} phiên mới nhất, mỗi phiên là một thư mục.`}
          </CardDescription>
        </CardHeader>
        {sessions.length > 0 && (
          <CardContent>
            <TileGrid>
              {sessions.map((s) => {
                const done = s.images.filter((i) => i.status === "SUCCESS").length;
                const failed = s.images.filter((i) => i.status === "FAILED").length;
                const running = s.images.length - done - failed;
                return (
                  <FolderTile
                    key={s.id}
                    href={`/sessions/${s.id}`}
                    name={s.logo.brand.name}
                    subtitle={`${s.logo.brand.customer.name} · ${fmt.format(s.createdAt)}${user.role === "ADMIN" ? ` · ${s.createdBy.name}` : ""}`}
                    footer={
                      running > 0
                        ? `${running} đang tạo · ${done}/${s.images.length} xong`
                        : failed > 0
                          ? `${failed} lỗi · ${done}/${s.images.length} xong`
                          : `${done}/${s.images.length} ảnh xong`
                    }
                    tone={running > 0 ? "busy" : failed > 0 ? "error" : "default"}
                  />
                );
              })}
            </TileGrid>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
