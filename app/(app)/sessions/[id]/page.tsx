import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { loadSessionViews } from "@/lib/jobs/views";
import { fileUrl } from "@/lib/storage";
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
    },
  });
  if (!session) notFound();

  const images = await loadSessionViews(session.id, user);
  const { brand } = session.logo;
  const created = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(session.createdAt);

  return (
    <div className="flex flex-col gap-6">
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
          <h1 className="text-2xl font-semibold">{brand.name}</h1>
          <p className="text-muted-foreground">
            {brand.customer.name}
            {brand.customer.phone ? ` · ${brand.customer.phone}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Tạo lúc {created} bởi {session.createdBy.name}
          </p>
        </div>
      </div>

      <SessionResults sessionId={session.id} initialImages={images} />
    </div>
  );
}
