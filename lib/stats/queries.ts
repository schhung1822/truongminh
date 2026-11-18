import "server-only";
import { db } from "@/lib/db";
import { zonedStartOfDay } from "@/lib/time";
import { addDays } from "./range";
import type { UsageRow } from "./aggregate";

/** Kết quả đếm của MySQL có thể là number, bigint, string hoặc Decimal: đổi hết về number. */
function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return Number(typeof v === "object" ? String(v) : v);
}

/** Mốc thời gian UTC [bắt đầu, kết thúc) của khoảng ngày theo múi giờ cấu hình. */
export function rangeBounds(from: string, to: string, tz: string): { start: Date; end: Date } {
  const start = zonedStartOfDay(from, tz);
  const end = zonedStartOfDay(addDays(to, 1), tz);
  if (!start || !end) throw new Error("Khoảng ngày không hợp lệ.");
  return { start, end };
}

/** Lượt tạo ảnh gom theo (ngày, người, loại ảnh) kèm số ảnh xong/lỗi và token. Mỗi dòng usage_logs là một ảnh tạo hoặc tạo lại. */
export async function loadUsageRows(from: string, to: string): Promise<UsageRow[]> {
  const rows = await db.$queryRaw<
    { day: string; userId: string; kind: "SHEET" | "DESIGN"; n: unknown; ok: unknown; failed: unknown; tokens: unknown }[]
  >`
    SELECT ul.day AS day, ul.userId AS userId, ul.kind AS kind,
           COUNT(*) AS n,
           COUNT(CASE WHEN gi.status = 'SUCCESS' THEN 1 END) AS ok,
           COUNT(CASE WHEN gi.status = 'FAILED' THEN 1 END) AS failed,
           COALESCE(SUM(gi.costCredits), 0) AS tokens
    FROM usage_logs ul
    LEFT JOIN generated_images gi ON gi.id = ul.imageId
    WHERE ul.day >= ${from} AND ul.day <= ${to}
    GROUP BY ul.day, ul.userId, ul.kind`;
  return rows.map((r) => ({
    day: r.day,
    userId: r.userId,
    kind: r.kind,
    count: num(r.n),
    ok: num(r.ok),
    failed: num(r.failed),
    tokens: num(r.tokens),
  }));
}

export type RankItem = { id: string; label: string; sub?: string; value: number };

export async function loadTopCustomers(start: Date, end: Date): Promise<RankItem[]> {
  const rows = await db.$queryRaw<{ id: string; name: string; n: unknown; sessions: unknown }[]>`
    SELECT c.id AS id, c.name AS name, COUNT(*) AS n, COUNT(DISTINCT cs.id) AS sessions
    FROM generated_images gi
    JOIN consult_sessions cs ON cs.id = gi.sessionId
    JOIN logos l ON l.id = cs.logoId
    JOIN brands b ON b.id = l.brandId
    JOIN customers c ON c.id = b.customerId
    WHERE gi.createdAt >= ${start} AND gi.createdAt < ${end}
    GROUP BY c.id, c.name
    ORDER BY n DESC, c.name ASC
    LIMIT 8`;
  return rows.map((r) => ({ id: r.id, label: r.name, sub: `${num(r.sessions)} phiên`, value: num(r.n) }));
}

/** Chất liệu được khách chọn nhiều nhất ở bước 2 (thiết kế). */
export async function loadTopMaterials(start: Date, end: Date): Promise<RankItem[]> {
  const rows = await db.$queryRaw<{ id: string; code: string; name: string; n: unknown }[]>`
    SELECT m.id AS id, m.code AS code, m.name AS name, COUNT(*) AS n
    FROM session_selected_materials sm
    JOIN consult_sessions cs ON cs.id = sm.sessionId
    JOIN materials m ON m.id = sm.materialId
    WHERE cs.createdAt >= ${start} AND cs.createdAt < ${end}
    GROUP BY m.id, m.code, m.name
    ORDER BY n DESC, m.code ASC
    LIMIT 8`;
  return rows.map((r) => ({ id: r.id, label: r.name, sub: r.code, value: num(r.n) }));
}

export async function loadTopStyles(start: Date, end: Date): Promise<RankItem[]> {
  const rows = await db.$queryRaw<{ id: string; name: string; n: unknown }[]>`
    SELECT ds.id AS id, ds.name AS name, COUNT(*) AS n
    FROM generated_images gi
    JOIN design_styles ds ON ds.id = gi.designStyleId
    WHERE gi.createdAt >= ${start} AND gi.createdAt < ${end}
    GROUP BY ds.id, ds.name
    ORDER BY n DESC, ds.name ASC
    LIMIT 8`;
  return rows.map((r) => ({ id: r.id, label: r.name, value: num(r.n) }));
}

export type FailureItem = {
  id: string;
  sessionId: string;
  at: Date;
  brand: string;
  userName: string;
  message: string | null;
  attempt: number;
};

export async function loadRecentFailures(start: Date, end: Date): Promise<FailureItem[]> {
  const rows = await db.generatedImage.findMany({
    where: { status: "FAILED", createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      sessionId: true,
      createdAt: true,
      errorMessage: true,
      attempt: true,
      createdBy: { select: { name: true } },
      session: { select: { logo: { select: { brand: { select: { name: true } } } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.sessionId,
    at: r.createdAt,
    brand: r.session.logo.brand.name,
    userName: r.createdBy.name,
    message: r.errorMessage,
    attempt: r.attempt,
  }));
}

export async function loadSessionCount(start: Date, end: Date): Promise<{ catalog: number; design: number }> {
  const groups = await db.consultSession.groupBy({
    by: ["type"],
    where: { createdAt: { gte: start, lt: end } },
    _count: { _all: true },
  });
  return {
    catalog: groups.find((g) => g.type === "CATALOG")?._count._all ?? 0,
    design: groups.find((g) => g.type === "DESIGN")?._count._all ?? 0,
  };
}

/** Số lượt mỗi người đã dùng trong ngày `today` (để so với hạn mức ngày). */
export async function loadTodayByUser(today: string): Promise<Map<string, number>> {
  const groups = await db.usageLog.groupBy({ by: ["userId"], where: { day: today }, _count: { _all: true } });
  return new Map(groups.map((g) => [g.userId, g._count._all]));
}
