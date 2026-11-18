"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";

/**
 * Đổi tên và xóa thư mục khách hàng / thương hiệu. Mọi tài khoản đăng nhập (admin và sale) đều làm được.
 * Chỉ xóa được thư mục CHƯA tạo ảnh nào: nếu bên trong đã có phiên tạo ảnh thì từ chối để không mất lịch sử.
 */

type Result = { error?: string };

const NOT_EMPTY = "Thư mục này đã tạo ảnh nên không xóa được. Chỉ xóa được thư mục chưa tạo ảnh nào.";

const nameSchema = (what: string) =>
  z.string().trim().min(1, `Vui lòng nhập tên ${what}.`).max(150, "Tên quá dài (tối đa 150 ký tự).");

export async function renameCustomerAction(id: string, name: string): Promise<Result & { name?: string }> {
  await requireUser();
  const parsed = nameSchema("khách hàng").safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const res = await db.customer.updateMany({ where: { id }, data: { name: parsed.data } });
  if (res.count === 0) return { error: "Không tìm thấy thư mục này (có thể đã bị xóa)." };
  return { name: parsed.data };
}

export async function renameBrandAction(id: string, name: string): Promise<Result & { name?: string }> {
  await requireUser();
  const parsed = nameSchema("thương hiệu").safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const res = await db.brand.updateMany({ where: { id }, data: { name: parsed.data } });
  if (res.count === 0) return { error: "Không tìm thấy thư mục này (có thể đã bị xóa)." };
  return { name: parsed.data };
}

/** Xóa file logo khỏi kho lưu trữ; lỗi từng file thì bỏ qua (file mồ côi không ảnh hưởng nghiệp vụ). */
async function removeLogoFiles(logos: { originalPath: string; normalizedPath: string }[]) {
  const storage = getStorage();
  for (const l of logos) {
    await storage.delete(l.originalPath).catch(() => {});
    await storage.delete(l.normalizedPath).catch(() => {});
  }
}

export async function deleteBrandAction(id: string): Promise<Result> {
  await requireUser();
  const brand = await db.brand.findUnique({ where: { id }, include: { logos: true } });
  if (!brand) return {};
  const used = await db.consultSession.count({ where: { logoId: { in: brand.logos.map((l) => l.id) } } });
  if (used > 0) return { error: NOT_EMPTY };

  await db.$transaction([db.logo.deleteMany({ where: { brandId: id } }), db.brand.delete({ where: { id } })]);
  await removeLogoFiles(brand.logos);
  return {};
}

export async function deleteCustomerAction(id: string): Promise<Result> {
  await requireUser();
  const customer = await db.customer.findUnique({ where: { id }, include: { brands: { include: { logos: true } } } });
  if (!customer) return {};
  const logos = customer.brands.flatMap((b) => b.logos);
  const used = await db.consultSession.count({ where: { logoId: { in: logos.map((l) => l.id) } } });
  if (used > 0) return { error: NOT_EMPTY };

  await db.$transaction([
    db.logo.deleteMany({ where: { brand: { customerId: id } } }),
    db.brand.deleteMany({ where: { customerId: id } }),
    db.customer.delete({ where: { id } }),
  ]);
  await removeLogoFiles(logos);
  return {};
}
