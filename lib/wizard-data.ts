import "server-only";
import type { LogoOption, CustomerOption } from "@/app/(app)/sessions/new/actions";
import type { SheetOption } from "@/app/(app)/sessions/new/sheets-steps";
import type { SessionUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getQuotaInfo } from "@/lib/jobs/limits";
import { canEditCustomer } from "@/lib/permissions";
import { fileUrl } from "@/lib/storage";

/** Danh sách thư mục khách hàng (mới nhất trước) kèm quyền sửa của người đang xem. */
export async function loadCustomerOptions(user: SessionUser): Promise<CustomerOption[]> {
  const customers = await db.customer.findMany({
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: { owner: { select: { name: true } }, _count: { select: { brands: true } } },
  });
  return customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    ownerName: c.owner.name,
    editable: canEditCustomer(user, c),
    brandCount: c._count.brands,
  }));
}

/** Khách + thương hiệu + logo của một logo cụ thể (để mở thẳng tới logo đó). */
export async function loadLogoContext(user: SessionUser, logoId: string, options: CustomerOption[]) {
  const logo = await db.logo.findUnique({ where: { id: logoId }, include: { brand: { include: { customer: true } } } });
  if (!logo) return null;
  const logoOption: LogoOption = {
    id: logo.id,
    url: fileUrl(logo.normalizedPath)!,
    width: logo.width,
    height: logo.height,
    note: logo.note,
  };
  return {
    customer:
      options.find((o) => o.id === logo.brand.customerId) ??
      ({
        id: logo.brand.customer.id,
        name: logo.brand.customer.name,
        phone: logo.brand.customer.phone,
        ownerName: "",
        editable: canEditCustomer(user, logo.brand.customer),
        brandCount: 0,
      } satisfies CustomerOption),
    brand: { id: logo.brand.id, name: logo.brand.name, logoCount: 0 },
    logo: logoOption,
  };
}

/** Các trang mẫu đang bật (kèm số chất liệu dùng được), quota và cờ hiện chi phí; dùng cho tạo phiên và nút Tạo nhanh. */
export async function loadSheetOptions(user: SessionUser) {
  const [sheetRows, quota] = await Promise.all([
    db.sheet.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { materials: { include: { material: { select: { isActive: true, referencePath: true, descAi: true } } } } },
    }),
    getQuotaInfo(user),
  ]);
  const sheets: SheetOption[] = sheetRows.map((s) => ({
    id: s.id,
    name: s.name,
    groupName: s.groupName,
    cols: s.cols,
    rows: s.rows,
    aspectRatio: s.aspectRatio,
    resolution: s.resolution,
    total: s.materials.length,
    usable: s.materials.filter((m) => m.material.isActive && m.material.referencePath).length,
    missingDesc: s.materials.filter((m) => m.material.isActive && m.material.referencePath && !m.material.descAi.trim()).length,
    isDefault: s.isDefault,
  }));
  return { sheets, quota, showCost: getEnv().IMAGE_PROVIDER === "kie" };
}

/** Mọi dữ liệu cần để dựng màn hình tạo phiên mới. */
export async function loadWizardData(user: SessionUser, logoId?: string) {
  const [{ sheets, quota, showCost }, customers] = await Promise.all([loadSheetOptions(user), loadCustomerOptions(user)]);
  const initial = logoId ? await loadLogoContext(user, logoId, customers) : null;
  return { customers, sheets, quota, initial, showCost };
}
