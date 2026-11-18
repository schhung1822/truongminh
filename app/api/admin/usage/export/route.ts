import { db } from "@/lib/db";
import { apiUser, isResponse } from "@/lib/api";
import { todayKey } from "@/lib/jobs/limits";
import { csvLine } from "@/lib/stats/csv";
import { loadUsageRows } from "@/lib/stats/queries";
import { parseRange } from "@/lib/stats/range";

/** Tải CSV lượt tạo ảnh theo ngày × người dùng × loại ảnh (chỉ admin). */
export async function GET(req: Request) {
  const user = await apiUser({ admin: true });
  if (isResponse(user)) return user;

  const sp = new URL(req.url).searchParams;
  const range = parseRange({ preset: sp.get("preset") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined }, todayKey());

  const [rows, users] = await Promise.all([
    loadUsageRows(range.from, range.to),
    db.user.findMany({ select: { id: true, name: true, email: true } }),
  ]);
  const byId = new Map(users.map((u) => [u.id, u]));

  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day) || a.userId.localeCompare(b.userId) || a.kind.localeCompare(b.kind));
  const lines = [csvLine(["Ngày", "Người dùng", "Email", "Loại", "Số lượt", "Ảnh xong", "Ảnh lỗi", "Token"])];
  for (const r of sorted) {
    const u = byId.get(r.userId);
    lines.push(csvLine([r.day, u?.name ?? r.userId, u?.email ?? "", r.kind === "SHEET" ? "Catalog" : "Thiết kế", r.count, r.ok, r.failed, r.tokens]));
  }

  // BOM để Excel mở đúng tiếng Việt có dấu
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="thong-ke-${range.from}_${range.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
