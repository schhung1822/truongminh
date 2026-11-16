import { apiUser, isResponse, jsonError } from "@/lib/api";
import { saveMaterial } from "@/lib/materials/save";

// Cập nhật chất liệu. Chỉ ADMIN.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser({ admin: true });
  if (isResponse(user)) return user;

  const { id } = await ctx.params;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Dữ liệu gửi lên không hợp lệ.");
  }
  const result = await saveMaterial(id, form);
  if (!result.ok) return jsonError(result.status, result.error);
  return Response.json({ id: result.id });
}
