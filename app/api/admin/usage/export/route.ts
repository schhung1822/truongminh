import { db } from "@/lib/db";
import { apiUser, isResponse } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { todayKey } from "@/lib/jobs/limits";
import { csvLine } from "@/lib/stats/csv";
import { classifyFailure, FIX_LABEL } from "@/lib/stats/failure-causes";
import { loadFailures, loadUsageRows, rangeBounds } from "@/lib/stats/queries";
import { parseRange, type StatsRange } from "@/lib/stats/range";

const RETRY_TEXT = { none: "Chưa tạo lại", ok: "Tạo lại được", failed: "Tạo lại vẫn lỗi", running: "Đang tạo lại" } as const;

// BOM để Excel mở đúng tiếng Việt có dấu
function csvResponse(lines: string[], fileName: string): Response {
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Mỗi ảnh lỗi một dòng, kèm nguyên nhân đã phân loại và câu lỗi gốc (D130), để lọc và đếm tiếp trong Excel. */
async function failuresCsv(range: StatsRange): Promise<Response> {
  const tz = getEnv().APP_TIMEZONE;
  const { start, end } = rangeBounds(range.from, range.to, tz);
  const failures = await loadFailures(start, end);
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: tz });
  const base = getEnv().APP_URL.replace(/\/+$/, "");

  const lines = [csvLine(["Thời gian", "Thương hiệu", "Người tạo", "Loại ảnh", "Model", "Chất liệu", "Nguyên nhân", "Ai xử lý", "Kết quả tạo lại", "Số lần hệ thống tự thử", "Câu lỗi gốc", "Phiên"])];
  for (const f of failures) {
    const cause = classifyFailure(f.message);
    lines.push(
      csvLine([
        fmt.format(f.at),
        f.brand,
        f.userName,
        f.kind === "SHEET" ? "Catalog" : "Thiết kế",
        f.model,
        f.materialCode ?? "",
        cause.label,
        FIX_LABEL[cause.fix],
        RETRY_TEXT[f.retry],
        f.attempt,
        f.message ?? "",
        `${base}/sessions/${f.sessionId}`,
      ]),
    );
  }
  return csvResponse(lines, `anh-loi-${range.from}_${range.to}.csv`);
}

/**
 * Tải CSV thống kê (chỉ admin). Mặc định: lượt tạo ảnh theo ngày × người dùng × loại ảnh. `type=failures`: danh sách ảnh lỗi.
 */
export async function GET(req: Request) {
  const user = await apiUser({ admin: true });
  if (isResponse(user)) return user;

  const sp = new URL(req.url).searchParams;
  const range = parseRange({ preset: sp.get("preset") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined }, todayKey());
  if (sp.get("type") === "failures") return failuresCsv(range);

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
  return csvResponse(lines, `thong-ke-${range.from}_${range.to}.csv`);
}
