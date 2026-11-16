import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getQuotaInfo } from "@/lib/jobs/limits";
import type { LayoutSnapshot } from "@/lib/jobs/snapshot";
import { getSettings } from "@/lib/settings";
import { fileUrl } from "@/lib/storage";
import { DesignForm, type DesignMaterial } from "./design-form";

export const metadata: Metadata = { title: "Bước 2: Thiết kế" };

export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const session = await db.consultSession.findUnique({
    where: { id },
    include: {
      logo: { include: { brand: { include: { customer: true } } } },
      images: { where: { status: "SUCCESS", retries: { none: {} } }, select: { layoutSnapshot: true, createdAt: true } },
    },
  });
  if (!session) notFound();
  // đang đứng ở một lượt thiết kế thì thiết kế thêm từ phiên catalog gốc
  if (session.type === "DESIGN" && session.parentId) redirect(`/sessions/${session.parentId}/design`);
  if (session.type !== "CATALOG") notFound();

  // chất liệu xuất hiện trong các ảnh catalog đã xong, theo thứ tự xuất hiện, không trùng
  const order: string[] = [];
  for (const img of session.images) {
    for (const c of (img.layoutSnapshot as unknown as LayoutSnapshot).cells) {
      if (!order.includes(c.materialId)) order.push(c.materialId);
    }
  }
  const [rows, styles, settings, quota] = await Promise.all([
    db.material.findMany({ where: { id: { in: order } } }),
    db.designStyle.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { name: true } }),
    getSettings(),
    getQuotaInfo(user),
  ]);
  const byId = new Map(rows.map((m) => [m.id, m]));
  const materials: DesignMaterial[] = order
    .map((mid) => byId.get(mid))
    .filter((m): m is NonNullable<typeof m> => !!m && !!m.referencePath)
    .map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      groupName: m.groupName,
      printTech: m.printTech,
      imageUrl: fileUrl(m.referencePath),
    }));

  const brand = session.logo.brand;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/sessions/${session.id}`} className="underline">
            ← Về phiên catalog
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">Bước 2: Thiết kế theo chất liệu khách chọn</h1>
        <p className="text-muted-foreground">
          {brand.name} · {brand.customer.name}. Chọn chất liệu khách ưng ý (thường 1 đến 5), loại sản phẩm và số phương án.
        </p>
      </div>

      {materials.length === 0 ? (
        <Alert>
          <AlertDescription>
            Phiên này chưa có ảnh catalog nào hoàn thành nên chưa có chất liệu để chọn.{" "}
            <Link href={`/sessions/${session.id}`} className="underline">
              Quay lại phiên
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : (
        <DesignForm
          parentSessionId={session.id}
          materials={materials}
          styleNames={styles.map((s) => s.name)}
          resolution={settings.designResolution}
          aspectRatio={settings.designAspectRatio}
          quota={quota}
          showCost={getEnv().IMAGE_PROVIDER === "kie"}
          isAdmin={user.role === "ADMIN"}
        />
      )}

      {materials.length === 0 && (
        <Link href={`/sessions/${session.id}`} className={buttonVariants({ variant: "outline", className: "h-10 self-start" })}>
          Về phiên catalog
        </Link>
      )}
    </div>
  );
}
