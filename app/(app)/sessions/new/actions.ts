"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
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
export type LogoOption = { id: string; url: string; width: number; height: number; note: string | null };

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
    })),
  };
}
