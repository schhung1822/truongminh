import { apiUser, isResponse } from "@/lib/api";
import { getUsageSummary } from "@/lib/usage-summary";

// Dữ liệu cho thanh đầu trang (tải lại định kỳ).
export async function GET() {
  const user = await apiUser();
  if (isResponse(user)) return user;
  return Response.json(await getUsageSummary(user), { headers: { "Cache-Control": "private, no-store" } });
}
