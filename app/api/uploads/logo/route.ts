import { apiUser, isResponse, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { createLogoFromBuffer, LogoError } from "@/lib/logos/create";
import { canEditCustomer } from "@/lib/permissions";
import { fileUrl } from "@/lib/storage";

// Upload logo cho một thương hiệu. Form nhiều phần: brandId, note (không bắt buộc), isBadge ("true" nếu logo dạng huy hiệu/bảng), file.
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

  let created;
  try {
    created = await createLogoFromBuffer({
      userId: user.id,
      brandId,
      file: Buffer.from(await file.arrayBuffer()),
      note,
      isBadge: form.get("isBadge") === "true",
    });
  } catch (e) {
    if (e instanceof LogoError) return jsonError(e.userFault ? 400 : 500, e.message);
    throw e;
  }
  const { logo, normalized } = created;

  return Response.json({
    logo: {
      id: logo.id,
      url: fileUrl(logo.normalizedPath),
      width: normalized.width,
      height: normalized.height,
      note: logo.note,
      isBadge: logo.isBadge,
    },
    warning: normalized.tooSmall
      ? "Logo nhỏ hơn 500px nên ảnh mô phỏng có thể bị mờ. Nên xin khách file lớn hơn nếu có."
      : null,
  });
}
