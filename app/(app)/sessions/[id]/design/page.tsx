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
import { MAX_DESIGN_MATERIALS } from "@/lib/design/assign";
import { compareSessionImages } from "@/lib/jobs/order";
import { DesignForm } from "./design-form";
import type { CatalogImage } from "./image-picker";

export const metadata: Metadata = { title: "Bước 2: Thiết kế" };

export default async function DesignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { m } = await searchParams;

  const session = await db.consultSession.findUnique({
    where: { id },
    include: {
      logo: { include: { brand: { include: { customer: true } } } },
      images: {
        where: { status: "SUCCESS", retries: { none: {} } },
        select: {
          id: true,
          layoutSnapshot: true,
          createdAt: true,
          finalPath: true,
          aspectRatio: true,
          materialId: true,
          variantIndex: true,
          sheet: { select: { sortOrder: true } },
        },
      },
    },
  });
  if (!session) notFound();
  // đang đứng ở một lượt thiết kế thì thiết kế thêm từ phiên catalog gốc
  if (session.type === "DESIGN" && session.parentId) redirect(`/sessions/${session.parentId}/design`);
  if (session.type !== "CATALOG") notFound();

  // chất liệu xuất hiện trong các ảnh catalog đã xong, theo thứ tự xuất hiện, không trùng
  const catalogImages = [...session.images].sort(compareSessionImages);
  const order: string[] = [];
  for (const img of catalogImages) {
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
  // chất liệu dùng được: còn tồn tại và đã có ảnh tham chiếu
  const usableIds = new Set(rows.filter((m) => !!m.referencePath).map((m) => m.id));
  const pickerImages: CatalogImage[] = catalogImages
    .filter((img) => !!img.finalPath)
    .map((img, i) => {
      const snap = img.layoutSnapshot as unknown as LayoutSnapshot;
      return {
        id: img.id,
        label: snap.imageNumber ? `Ảnh ${snap.imageNumber}` : `Ảnh ${i + 1}`,
        url: fileUrl(img.finalPath)!,
        aspectRatio: img.aspectRatio,
        cols: snap.cols,
        rows: snap.rows,
        cells: snap.cells.map((c, n) => {
          const m = byId.get(c.materialId);
          return {
            number: n + 1,
            materialId: c.materialId,
            code: c.code,
            name: c.name,
            groupName: m?.groupName ?? c.groupName ?? "",
            printTech: m?.printTech ?? c.printTech ?? "",
            technique: m?.technique ?? null,
            usable: usableIds.has(c.materialId),
          };
        }),
      };
    })
    .filter((img) => img.cells.some((c) => c.usable));

  // chất liệu đã chọn sẵn từ trang kết quả (?m=id1,id2): chỉ nhận chất liệu có thật trong ảnh và dùng được
  const usableInImages = new Set(pickerImages.flatMap((img) => img.cells.filter((c) => c.usable).map((c) => c.materialId)));
  const initialSelected = [...new Set((m ?? "").split(",").filter((x) => usableInImages.has(x)))].slice(0, MAX_DESIGN_MATERIALS);

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
          {brand.name} · {brand.customer.name}. Bấm vào ảnh catalog và chọn số của chất liệu khách ưng ý (thường 1 đến 5), rồi chọn loại sản phẩm và số phương án.
        </p>
      </div>

      {pickerImages.length === 0 ? (
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
          logoId={session.logoId}
          images={pickerImages}
          initialSelected={initialSelected}
          styleNames={styles.map((s) => s.name)}
          resolution={settings.designResolution}
          aspectRatio={settings.designAspectRatio}
          imageModel={settings.imageModel}
          quota={quota}
          showCost={getEnv().IMAGE_PROVIDER === "kie"}
          isAdmin={user.role === "ADMIN"}
        />
      )}

      {pickerImages.length === 0 && (
        <Link href={`/sessions/${session.id}`} className={buttonVariants({ variant: "outline", className: "h-10 self-start" })}>
          Về phiên catalog
        </Link>
      )}
    </div>
  );
}
