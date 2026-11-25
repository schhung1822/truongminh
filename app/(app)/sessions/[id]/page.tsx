import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CalculatorIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderTile, TileGrid } from "@/components/folder-ui";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import type { SessionAiAnalysis } from "@/lib/jobs/auto";
import { loadSessionViews } from "@/lib/jobs/views";
import { canEditOwned } from "@/lib/permissions";
import { listQuotes } from "@/lib/quoting/store";
import { getSettings } from "@/lib/settings";
import { fileUrl } from "@/lib/storage";
import { fmtCm, fmtVnd } from "@/app/(app)/quote/format";
import { QuoteStatusBadge } from "@/app/(app)/quote/status-badge";
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

  const [images, settings, quotes] = await Promise.all([loadSessionViews(session.id, user), getSettings(), listQuotes({ sessionId: session.id, limit: 5 })]);
    const { brand } = session.logo;
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
  const isDesign = session.type === "DESIGN";
  const catalogId = isDesign ? session.parentId : session.id;
  // phiên do AI chọn chất liệu (D115): nhận xét logo và lý do chọn từng chất liệu
  const ai = session.aiAnalysis as unknown as SessionAiAnalysis | null;

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
        labelMode={settings.labelMode}
        defaultLabelPos={settings.labelPos}
      />

      {ai && ai.picks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>AI chọn {ai.picks.length} chất liệu cho logo này</CardTitle>
            <CardDescription>{ai.summary || "AI đã xem logo và chọn các chất liệu hợp nhất trong danh mục đang bật."}</CardDescription>
          </CardHeader>
          <CardContent>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Xem lý do chọn từng chất liệu</summary>
              <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {ai.picks.map((p, i) => (
                  <li key={p.materialId} className="flex gap-2">
                    <span className="w-6 shrink-0 text-right text-muted-foreground tabular-nums">{i + 1}.</span>
                    <span className="min-w-0">
                      <span className="font-medium">
                        {p.code} - {p.name}
                      </span>
                      {p.reason && <span className="text-muted-foreground">: {p.reason}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          </CardContent>
        </Card>
      )}

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

      <Card>
        <CardHeader>
          <CardTitle>Báo giá sản xuất</CardTitle>
          <CardDescription>Xếp logo lên tấm chất liệu và tính giá theo số lượng.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div>
            <Link
              href={`/quote?logoId=${encodeURIComponent(session.logoId)}&sessionId=${encodeURIComponent(session.id)}`}
              className={buttonVariants({ className: "h-10" })}
            >
              <CalculatorIcon /> Lập báo giá cho logo này
            </Link>
          </div>
          {quotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Phiên này chưa có báo giá nào.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {quotes.map((q) => (
                <li key={q.id}>
                  <Link href={`/quote/${q.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-sm no-underline transition-colors hover:bg-muted/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{q.materialLabel}</span>
                      <span className="block text-xs text-muted-foreground">
                        Logo {fmtCm(q.logoWidthMm)} cm · {q.perSheet} logo/tấm
                        {q.firstUnitPrice !== null ? ` · ${fmtVnd(q.firstUnitPrice)}/cái ở mốc đầu` : ""}
                      </span>
                    </span>
                    <QuoteStatusBadge status={q.status} />
                    <span className="text-xs text-muted-foreground">
                      {q.createdByName} · {fmt.format(q.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
