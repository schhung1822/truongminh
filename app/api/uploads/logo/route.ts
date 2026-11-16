import { apiUser, isResponse, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { normalizeLogo } from "@/lib/imaging/normalize-logo";
import { canEditCustomer } from "@/lib/permissions";
import { fileUrl, getStorage } from "@/lib/storage";

// Upload logo cho một thương hiệu. Form nhiều phần: brandId, note (không bắt buộc), file.
export async function POST(request: Request) {
  const user = await apiUser();
  if (isResponse(user)) return user;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Dữ liệu gửi lên không hợp lệ.");
  }

  const brandId = String(form.get("brandId") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return jsonError(400, "Vui lòng chọn file logo.");

  const brand = await db.brand.findUnique({ where: { id: brandId }, include: { customer: true } });
  if (!brand) return jsonError(404, "Không tìm thấy thương hiệu.");
  if (!canEditCustomer(user, brand.customer)) {
    return jsonError(403, "Khách hàng này do người khác phụ trách, bạn không thêm logo được.");
  }

  let normalized;
  try {
    normalized = await normalizeLogo(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return jsonError(400, e instanceof Error ? e.message : "Không xử lý được logo.");
  }

  const storage = getStorage();
  const logo = await db.logo.create({
    data: {
      brandId,
      note: note || null,
      originalPath: "pending",
      normalizedPath: "pending",
      width: normalized.width,
      height: normalized.height,
      createdById: user.id,
    },
  });

  const originalKey = `logos/${logo.id}/original.${normalized.originalExt}`;
  const normalizedKey = `logos/${logo.id}/normalized.png`;
  try {
    await storage.put(originalKey, Buffer.from(await file.arrayBuffer()));
    await storage.put(normalizedKey, normalized.png);
    await db.logo.update({ where: { id: logo.id }, data: { originalPath: originalKey, normalizedPath: normalizedKey } });
  } catch (e) {
    console.error("upload logo lỗi:", e);
    await Promise.all([storage.delete(originalKey), storage.delete(normalizedKey)]).catch(() => {});
    await db.logo.delete({ where: { id: logo.id } }).catch(() => {});
    return jsonError(500, "Không lưu được logo. Vui lòng thử lại.");
  }

  return Response.json({
    logo: {
      id: logo.id,
      url: fileUrl(normalizedKey),
      width: normalized.width,
      height: normalized.height,
      note: logo.note,
    },
    warning: normalized.tooSmall
      ? "Logo nhỏ hơn 500px nên ảnh mô phỏng có thể bị mờ. Nên xin khách file lớn hơn nếu có."
      : null,
  });
}
