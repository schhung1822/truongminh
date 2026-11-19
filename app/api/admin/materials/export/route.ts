import { apiUser, isResponse } from "@/lib/api";
import { buildMaterialsCsv } from "@/lib/materials/export";
import { todayKey } from "@/lib/jobs/limits";

/** Tải CSV toàn bộ chất liệu (chỉ admin). Cùng định dạng với trang Nhập từ CSV. */
export async function GET() {
  const user = await apiUser({ admin: true });
  if (isResponse(user)) return user;
  return new Response(await buildMaterialsCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="chat-lieu-${todayKey()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
