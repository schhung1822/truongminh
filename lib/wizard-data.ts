import "server-only";
import type { LogoOption, CustomerOption } from "@/app/(app)/sessions/new/actions";
import type { SheetOption } from "@/app/(app)/sessions/new/sheets-steps";
import type { SessionUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { AUTO_SHEET_LAYOUT } from "@/lib/image-options";
import { getQuotaInfo } from "@/lib/jobs/limits";
import { canEditCustomer } from "@/lib/permissions";
import { countSheetImages, countSheetTasks } from "@/lib/sheets/split";
import { getSettings } from "@/lib/settings";
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
    isBadge: logo.isBadge,
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

/** Các trang mẫu đang bật (kèm số chất liệu dùng được), quota và cờ hiện chi phí; dùng cho tạo phiên và các nút tạo ảnh ở khung logo. */
export async function loadSheetOptions(user: SessionUser) {
  const [sheetRows, quota, settings, usableMaterials, styleCount] = await Promise.all([
    db.sheet.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { materials: { include: { material: { select: { isActive: true, referencePath: true } } } } },
    }),
    getQuotaInfo(user),
    getSettings(),
    db.material.count({ where: { isActive: true, referencePath: { not: null } } }),
    db.designStyle.count({ where: { isActive: true } }),
  ]);
  // Thiết kế theo mẫu Pinterest (D125): thông số để hộp chọn mẫu hiện ước tính và chặn sớm khi thiếu kiểu thiết kế
  const design = { resolution: settings.designResolution as string, styleCount, usableMaterials };
  // AI chọn chất liệu theo logo (D115): số chất liệu và số ảnh sẽ tạo, để hiện ước tính trước khi bấm
  const autoCount = Math.min(settings.autoMaterialCount, usableMaterials);
  const auto = {
    count: autoCount,
    images: Math.ceil(autoCount / (AUTO_SHEET_LAYOUT.cols * AUTO_SHEET_LAYOUT.rows)),
    // số tác vụ AI (= số lượt) nếu bật chất lượng cao (D120)
    qualityTasks: countSheetTasks(autoCount, AUTO_SHEET_LAYOUT.cols, AUTO_SHEET_LAYOUT.rows, true),
    resolution: settings.defaultResolution as string,
  };
  // Tất cả chất liệu đang bật (D126): cùng cách chia 8 ô mỗi ảnh
  const allMaterials = {
    count: usableMaterials,
    images: Math.ceil(usableMaterials / (AUTO_SHEET_LAYOUT.cols * AUTO_SHEET_LAYOUT.rows)),
    qualityTasks: countSheetTasks(usableMaterials, AUTO_SHEET_LAYOUT.cols, AUTO_SHEET_LAYOUT.rows, true),
    resolution: settings.defaultResolution as string,
  };
  const sheets: SheetOption[] = sheetRows.map((s) => {
    const usable = s.materials.filter((m) => m.material.isActive && m.material.referencePath).length;
    return {
      id: s.id,
      name: s.name,
      groupName: s.groupName,
      cols: s.cols,
      rows: s.rows,
      aspectRatio: s.aspectRatio,
      resolution: s.resolution,
      total: s.materials.length,
      usable,
      images: countSheetImages(usable, s.cols, s.rows),
      isDefault: s.isDefault,
    };
  });
  return { sheets, quota, showCost: getEnv().IMAGE_PROVIDER === "kie", imageModel: settings.imageModel, auto, allMaterials, qualityDefault: settings.qualityDefault, design };
}

/** Mọi dữ liệu cần để dựng màn hình tạo phiên mới. */
export async function loadWizardData(user: SessionUser, logoId?: string) {
  const [{ sheets, quota, showCost, imageModel, auto, allMaterials, qualityDefault, design }, customers] = await Promise.all([loadSheetOptions(user), loadCustomerOptions(user)]);
  const initial = logoId ? await loadLogoContext(user, logoId, customers) : null;
  return { customers, sheets, quota, initial, showCost, imageModel, auto, allMaterials, qualityDefault, design };
}
