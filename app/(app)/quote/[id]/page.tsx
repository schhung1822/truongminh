import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getQuote } from "@/lib/quoting/store";
import { ENGRAVE_LEVEL_LABEL, type EngraveLevel } from "@/lib/quoting/types";
import { fileUrl } from "@/lib/storage";
import { fmtCm, fmtInt, fmtPct } from "../format";
import { LayoutPanel } from "../layout-panel";
import { CopyPriceButton, CostDetails, InternalDetails, PriceTable } from "../price-parts";
import { StatusControl } from "../status-control";
import { QuoteStatusBadge } from "../status-badge";

export const metadata: Metadata = { title: "Chi tiết báo giá" };

const dateFmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  // store trả đúng góc nhìn theo vai: sale không bao giờ nhận giá vốn
  const quote = await getQuote({ id: user.id, role: user.role }, id);
  if (!quote) notFound();

  const logo = await db.logo.findUnique({
    where: { id: quote.logoId },
    select: { normalizedPath: true, brand: { select: { name: true, customer: { select: { name: true, phone: true } } } } },
  });
  const logoUrl = fileUrl(logo?.normalizedPath);
  const brandName = logo?.brand.name ?? "(logo đã xóa)";
  const customer = logo?.brand.customer;

  const sizeText = `${fmtCm(quote.logoWidthMm)} x ${fmtCm(quote.logoHeightMm)} cm`;
  const engraveText = ENGRAVE_LEVEL_LABEL[quote.engraveLevel as EngraveLevel] ?? quote.engraveLevel;
  const backHref = `/quote?logoId=${encodeURIComponent(quote.logoId)}${quote.sessionId ? `&sessionId=${encodeURIComponent(quote.sessionId)}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <Link href={backHref} className={buttonVariants({ variant: "ghost", size: "sm", className: "self-start" })}>
        <ArrowLeftIcon /> Về công cụ báo giá
      </Link>

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
          {logoUrl ? <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">Không có ảnh</span>}
        </div>
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            Báo giá {brandName}
            <QuoteStatusBadge status={quote.status} />
          </h1>
          <p className="text-muted-foreground">
            {customer ? `${customer.name}${customer.phone ? ` · ${customer.phone}` : ""}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Lập lúc {dateFmt.format(quote.createdAt)} bởi {quote.createdByName}
            {quote.sentAt ? ` · gửi khách ${dateFmt.format(quote.sentAt)}` : ""}
            {quote.wonAt ? ` · khách chốt ${dateFmt.format(quote.wonAt)}` : ""}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Chất liệu">{quote.materialLabel}</Field>
            <Field label="Kích thước logo">{sizeText}</Field>
            <Field label="Mức khắc">{engraveText}</Field>
            <Field label="Logo mỗi tấm">{fmtInt(quote.perSheet)}</Field>
            <Field label="Hiệu suất dùng tấm">{fmtPct(quote.efficiencyPct)}</Field>
            <Field label="Phương án xếp">{quote.layout.label || "—"}</Field>
            {quote.sessionId && (
              <Field label="Phiên tư vấn">
                <Link href={`/sessions/${quote.sessionId}`} className="text-primary underline underline-offset-2">
                  Mở phiên
                </Link>
              </Field>
            )}
            {quote.note && (
              <div className="flex flex-col gap-0.5 sm:col-span-2 lg:col-span-3">
                <dt className="text-xs text-muted-foreground">Ghi chú</dt>
                <dd className="text-sm whitespace-pre-wrap">{quote.note}</dd>
              </div>
            )}
          </dl>
          <StatusControl id={quote.id} status={quote.status} backHref={backHref} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bảng giá theo số lượng</CardTitle>
          <CardDescription>Giá đã lưu lúc lập báo giá.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <PriceTable lines={quote.lines} />
          <div>
            <CopyPriceButton lines={quote.lines} title={`Báo giá logo ${sizeText}, chất liệu ${quote.materialLabel}`} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bố cục xếp logo trên tấm</CardTitle>
          <CardDescription>Đúng như lúc lập báo giá, không đổi khi thông số tấm thay đổi sau này.</CardDescription>
        </CardHeader>
        <CardContent>
          <LayoutPanel
            layout={{ stock: quote.layout.stock, placements: quote.layout.placements, label: quote.layout.label }}
            logoUrl={logoUrl}
            title={`${brandName} · ${quote.materialLabel} · logo ${sizeText}`}
          />
        </CardContent>
      </Card>

      <InternalDetails
        lines={quote.lines}
        efficiencyPct={quote.efficiencyPct}
        perSheet={quote.perSheet}
        layoutLabel={quote.layout.label}
        strategy={quote.layout.strategy}
      />

      {quote.cost ? <CostDetails params={quote.cost.params} lines={quote.cost.lines} /> : null}
    </div>
  );
}
