import { apiUser, isResponse } from "@/lib/api";
import { getFbLeadNewCount } from "@/lib/fb/lead-filters";

/** Số lead mới cho chấm đỏ trên menu (tải lại định kỳ ở app-shell.tsx). */
export async function GET() {
  const user = await apiUser();
  if (isResponse(user)) return user;
  return Response.json({ count: await getFbLeadNewCount(user) }, { headers: { "Cache-Control": "private, no-store" } });
}
