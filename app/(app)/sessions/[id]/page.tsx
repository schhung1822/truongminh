import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderTile, TileGrid } from "@/components/folder-ui";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { loadSessionViews } from "@/lib/jobs/views";
import { canEditOwned } from "@/lib/permissions";
import { fileUrl } from "@/lib/storage";
import { groupSendEnabled } from "@/lib/zalo/settings";
import { SessionResults } from "./session-results";

export const metadata: Metadata = { title: "Kết quả phiên tư vấn" };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const session = await db.consultSession.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      logo: { include: { brand: { include: { customer: true } } } },
      // các lượt thiết kế (bước 2) của phiên catalog này
      children: {
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: { select: { name: true } },
          images: { where: { retries: { none: {} } }, select: { status: true } },
        },
      },
    },
  });
  if (!session) notFound();

  const images = await loadSessionViews(session.id, user);
  // nút "Gửi lên nhóm Zalo" chỉ hiện khi bot đã cấu hình và người xem là người tạo phiên hoặc admin
  const zaloGroups =
    canEditOwned(user, session.createdById) && (await groupSendEnabled())
      ? await db.zaloGroup.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : [];
  const { brand } = session.logo;
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
  const isDesign = session.type === "DESIGN";
  const catalogId = isDesign ? session.parentId : session.id;

  return (
    <div className="flex flex-col gap-6">
      {isDesign && catalogId && (
        <Link href={`/sessions/${catalogId}`} className={buttonVariants({ variant: "ghost", size: "sm", className: "self-start" })}>
          <ArrowLeftIcon /> Về phiên catalog
        </Link>
      )}

      <div className="flex items-start gap-4">
        <div
          className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
          style={{
            backgroundColor: "#fff",
            backgroundImage:
              "linear-gradient(45deg,#e5e5e5 25%,transparent 25%),linear-gradient(-45deg,#e5e5e5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e5e5 75%),linear-gradient(-45deg,transparent 75%,#e5e5e5 75%)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
          }}
        >
          <img src={fileUrl(session.logo.normalizedPath)!} alt="Logo" className="max-h-full max-w-full object-contain" />
        </div>
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {brand.name}
            {isDesign && <Badge variant="secondary">Bước 2: thiết kế</Badge>}
          </h1>
          <p className="text-muted-foreground">
            {brand.customer.name}
            {brand.customer.phone ? ` · ${brand.customer.phone}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Tạo lúc {fmt.format(session.createdAt)} bởi {session.createdBy.name}
          </p>
          {isDesign && (
            <p className="mt-1 text-sm">
              Sản phẩm: <b>{session.productType}</b> · {session.variantsPerMaterial} phương án mỗi chất liệu
              {session.note ? ` · Ghi chú: ${session.note}` : ""}
            </p>
          )}
        </div>
      </div>

      <SessionResults
        sessionId={session.id}
        initialImages={images}
        canRefinish={canEditOwned(user, session.createdById)}
        designHref={catalogId ? `/sessions/${catalogId}/design` : undefined}
        isDesign={isDesign}
        zaloGroups={zaloGroups}
      />

      {!isDesign && session.children.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Các lượt thiết kế (bước 2)</CardTitle>
            <CardDescription>Mỗi lượt là một lần thiết kế theo chất liệu khách chọn.</CardDescription>
          </CardHeader>
          <CardContent>
            <TileGrid>
              {session.children.map((c) => {
                const done = c.images.filter((i) => i.status === "SUCCESS").length;
                const failed = c.images.filter((i) => i.status === "FAILED").length;
                const running = c.images.length - done - failed;
                return (
                  <FolderTile
                    key={c.id}
                    href={`/sessions/${c.id}`}
                    name={c.productType ?? "Thiết kế"}
                    subtitle={`${fmt.format(c.createdAt)} · ${c.createdBy.name}`}
                    footer={
                      running > 0
                        ? `${running} đang tạo · ${done}/${c.images.length} xong`
                        : failed > 0
                          ? `${failed} lỗi · ${done}/${c.images.length} xong`
                          : `${done}/${c.images.length} ảnh xong`
                    }
                    tone={running > 0 ? "busy" : failed > 0 ? "error" : "default"}
                  />
                );
              })}
            </TileGrid>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
