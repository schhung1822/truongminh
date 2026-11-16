import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { canEditCustomer } from "@/lib/permissions";
import { fileUrl } from "@/lib/storage";
import { getQuotaInfo } from "@/lib/jobs/limits";
import { NewSessionWizard, type WizardInitial } from "./wizard";
import type { CustomerOption } from "./actions";

export const metadata: Metadata = { title: "Tạo phiên tư vấn mới" };

export default async function NewSessionPage({ searchParams }: { searchParams: Promise<{ logoId?: string }> }) {
  const user = await requireUser();
  const { logoId } = await searchParams;

  const [sheetRows, quota] = await Promise.all([
    db.sheet.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { materials: { include: { material: { select: { isActive: true, referencePath: true } } } } },
    }),
    getQuotaInfo(user),
  ]);
  const sheets = sheetRows.map((s) => ({
    id: s.id,
    name: s.name,
    groupName: s.groupName,
    cols: s.cols,
    rows: s.rows,
    aspectRatio: s.aspectRatio,
    resolution: s.resolution,
    total: s.materials.length,
    usable: s.materials.filter((m) => m.material.isActive && m.material.referencePath).length,
  }));

  const customers = await db.customer.findMany({
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: { owner: { select: { name: true } } },
  });
  const options: CustomerOption[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    ownerName: c.owner.name,
    editable: canEditCustomer(user, c),
  }));

  // Tạo phiên mới từ logo cũ: bỏ qua 3 bước đầu
  let initial: WizardInitial | null = null;
  if (logoId) {
    const logo = await db.logo.findUnique({ where: { id: logoId }, include: { brand: { include: { customer: true } } } });
    if (logo) {
      initial = {
        customer: options.find((o) => o.id === logo.brand.customerId) ?? {
          id: logo.brand.customer.id,
          name: logo.brand.customer.name,
          phone: logo.brand.customer.phone,
          ownerName: "",
          editable: canEditCustomer(user, logo.brand.customer),
        },
        brand: { id: logo.brand.id, name: logo.brand.name, logoCount: 0 },
        logo: {
          id: logo.id,
          url: fileUrl(logo.normalizedPath)!,
          width: logo.width,
          height: logo.height,
          note: logo.note,
        },
      };
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Tạo phiên tư vấn mới</h1>
        <p className="text-muted-foreground">Làm lần lượt từng bước: khách hàng, thương hiệu, logo, trang mẫu.</p>
      </div>
      <NewSessionWizard customers={options} initial={initial} sheets={sheets} quota={quota} />
    </div>
  );
}
