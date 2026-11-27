"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { standaloneDesignLabel } from "@/lib/jobs/ai-state";
import { canEditCustomer } from "@/lib/permissions";
import { fileUrl } from "@/lib/storage";

export type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
  ownerName: string;
  editable: boolean;
  brandCount: number;
};
export type BrandOption = { id: string; name: string; logoCount: number };
export type LogoOption = {
  id: string;
  url: string;
  width: number;
  height: number;
  note: string | null;
  /** logo dạng huy hiệu/bảng (có nền + khung viền riêng): chất liệu khắc giữ nguyên hình bảng, xem docs/DECISIONS.md D113 */
  isBadge: boolean;
};

const customerSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên khách hàng.").max(150),
  phone: z.string().trim().max(50).optional(),
  note: z.string().trim().max(2000).optional(),
});

export async function createCustomerAction(
  input: z.input<typeof customerSchema>,
): Promise<{ error?: string; customer?: CustomerOption }> {
  const user = await requireUser();
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const c = await db.customer.create({
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      note: parsed.data.note || null,
      ownerId: user.id,
      createdById: user.id,
    },
  });
  return { customer: { id: c.id, name: c.name, phone: c.phone, ownerName: user.name, editable: true, brandCount: 0 } };
}

export async function listBrandsAction(customerId: string): Promise<{ error?: string; brands?: BrandOption[] }> {
  await requireUser();
  const brands = await db.brand.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { logos: true } } },
  });
  return { brands: brands.map((b) => ({ id: b.id, name: b.name, logoCount: b._count.logos })) };
}

export async function createBrandAction(
  customerId: string,
  name: string,
): Promise<{ error?: string; brand?: BrandOption }> {
  const user = await requireUser();
  const parsed = z.string().trim().min(1, "Vui lòng nhập tên thương hiệu.").max(150).safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { error: "Không tìm thấy khách hàng." };
  if (!canEditCustomer(user, customer)) {
    return { error: "Khách hàng này do người khác phụ trách, bạn không thêm thương hiệu được." };
  }
  const b = await db.brand.create({ data: { customerId, name: parsed.data, createdById: user.id } });
  return { brand: { id: b.id, name: b.name, logoCount: 0 } };
}

export async function listLogosAction(brandId: string): Promise<{ error?: string; logos?: LogoOption[] }> {
  await requireUser();
  const logos = await db.logo.findMany({ where: { brandId }, orderBy: { createdAt: "desc" } });
  return {
    logos: logos.map((l) => ({
      id: l.id,
      url: fileUrl(l.normalizedPath)!,
      width: l.width,
      height: l.height,
      note: l.note,
      isBadge: l.isBadge,
    })),
  };
}

/**
 * Đánh dấu / bỏ đánh dấu "logo dạng huy hiệu/bảng" (D113). Quyền như tải logo: người phụ trách khách hàng hoặc admin.
 * Chỉ ảnh tạo SAU khi đổi mới theo giá trị mới; ảnh đã tạo giữ nguyên.
 */
export async function setLogoBadgeAction(logoId: string, isBadge: boolean): Promise<{ error?: string }> {
  const user = await requireUser();
  const logo = await db.logo.findUnique({ where: { id: logoId }, include: { brand: { include: { customer: true } } } });
  if (!logo) return { error: "Không tìm thấy logo." };
  if (!canEditCustomer(user, logo.brand.customer)) {
    return { error: "Khách hàng này do người khác phụ trách, bạn không sửa logo được." };
  }
  await db.logo.update({ where: { id: logoId }, data: { isBadge: isBadge === true } });
  return {};
}

export type LogoSessionOption = {
  id: string;
  createdAt: string;
  creatorName: string;
  done: number;
  failed: number;
  running: number;
  total: number;
  /** phiên thiết kế không có phiên cha (theo mẫu Pinterest D125, hoặc theo chất liệu chỉ định D129): loại sản phẩm; phiên ảnh chất liệu thì null */
  pinDesign: string | null;
  /** tên gọi của kiểu phiên thiết kế đó ("Thiết kế theo mẫu Pinterest"...); phiên ảnh chất liệu thì null */
  designLabel: string | null;
};

/** Phiên hiện ở danh sách: phiên ảnh chất liệu, và phiên thiết kế theo mẫu Pinterest (phiên DESIGN không có phiên cha). */
const TOP_LEVEL_SESSION = { OR: [{ type: "CATALOG" as const }, { type: "DESIGN" as const, parentId: null }] };

/** Các phiên tư vấn đã tạo với một logo (mới nhất trước). */
export async function listLogoSessionsAction(logoId: string): Promise<{ sessions: LogoSessionOption[] }> {
  await requireUser();
  const sessions = await db.consultSession.findMany({
    where: { logoId, ...TOP_LEVEL_SESSION },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      createdBy: { select: { name: true } },
      images: { where: { retries: { none: {} } }, select: { status: true } },
    },
  });
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
  return {
    sessions: sessions.map((s) => {
      const done = s.images.filter((i) => i.status === "SUCCESS").length;
      const failed = s.images.filter((i) => i.status === "FAILED").length;
      return {
        id: s.id,
        createdAt: fmt.format(s.createdAt),
        creatorName: s.createdBy.name,
        done,
        failed,
        running: s.images.length - done - failed,
        total: s.images.length,
        pinDesign: s.type === "DESIGN" ? (s.productType ?? "Thiết kế") : null,
        designLabel: s.type === "DESIGN" ? standaloneDesignLabel(s.aiAnalysis) : null,
      };
    }),
  };
}

export type LogoFavoritePinOption = { id: string; pinId: string; title: string | null; sourceImageUrl: string };

/** Pin Pinterest khách đã thích, lưu theo logo (xem docs/DECISIONS.md D98). */
export async function listLogoFavoritePinsAction(logoId: string): Promise<{ favorites: LogoFavoritePinOption[] }> {
  await requireUser();
  const favorites = await db.logoFavoritePin.findMany({
    where: { logoId },
    orderBy: { createdAt: "desc" },
    select: { id: true, pin: { select: { id: true, title: true, sourceImageUrl: true } } },
  });
  return { favorites: favorites.map((f) => ({ id: f.id, pinId: f.pin.id, title: f.pin.title, sourceImageUrl: f.pin.sourceImageUrl })) };
}

/** Bỏ lưu một pin thích của logo (nút "x" trong màn Khách hàng), không cần vào lại /pinterest. */
export async function removeLogoFavoritePinAction(favoriteId: string): Promise<{ error?: string }> {
  await requireUser();
  await db.logoFavoritePin.deleteMany({ where: { id: favoriteId } });
  return {};
}
