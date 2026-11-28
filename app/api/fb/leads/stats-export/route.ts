import { apiUser, isResponse, jsonError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { canManageFb } from "@/lib/fb/access";
import { LEAD_STATUS_ORDER, loadLeadStats, loadSupplierFunnel, SUPPLIER_FUNNEL_STEPS } from "@/lib/fb/lead-stats";
import { todayKey } from "@/lib/jobs/limits";
import { STATUS_LABEL } from "@/app/(app)/fb/leads/lead-status";
import { csvLine } from "@/lib/stats/csv";
import { rangeBounds } from "@/lib/stats/queries";
import { parseRange } from "@/lib/stats/range";

/** Xuất CSV số liệu Lead Facebook (theo ngày + phễu chuyển đổi + theo sale) của trang /fb/leads/stats. */
export async function GET(req: Request) {
  const user = await apiUser();
  if (isResponse(user)) return user;
  if (!canManageFb(user.role)) return jsonError(403, "Chỉ quản trị viên và marketing xem được báo cáo này.");

  const sp = new URL(req.url).searchParams;
  const tz = getEnv().APP_TIMEZONE;
  const range = parseRange({ preset: sp.get("preset") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined }, todayKey());
  const { start, end } = rangeBounds(range.from, range.to, tz);
  const [stats, supplier] = await Promise.all([loadLeadStats(start, end, range.days, tz), loadSupplierFunnel(start, end)]);

  const lines = [`# Lead Facebook — từ ${range.from} đến ${range.to}`, "", csvLine(["Trạng thái", "Số lead"])];
  for (const s of LEAD_STATUS_ORDER) lines.push(csvLine([STATUS_LABEL[s], stats.funnel[s]]));
  lines.push("", csvLine(["Phễu bài tìm nhà sản xuất", "Số lượng"]), csvLine(["Lead nhà sản xuất", supplier.leads]));
  for (const s of SUPPLIER_FUNNEL_STEPS) lines.push(csvLine([s.label, supplier[s.key]]));
  lines.push("", csvLine(["Ngày", "Số lead mới"]));
  for (const d of stats.byDay) lines.push(csvLine([d.day, d.count]));
  lines.push("", csvLine(["Sale", "Tổng lead", "Đã chốt"]));
  for (const s of stats.bySale) lines.push(csvLine([s.name, s.total, s.won]));
  lines.push("", csvLine(["Nhóm", "Số lead"]));
  for (const g of stats.topGroups) lines.push(csvLine([g.label, g.value]));

  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="thong-ke-lead-${range.from}_${range.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
