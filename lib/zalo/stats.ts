import "server-only";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { todayKey } from "@/lib/jobs/limits";
import { addDays } from "@/lib/stats/range";
import { zonedStartOfDay } from "@/lib/time";

export type ZaloStats = {
  customers: number;
  groups: number;
  staff: number;
  unread: number;
  waiting: number;
  /** 7 ngày gần nhất (cũ → mới) */
  daily: { day: string; incoming: number; bot: number; human: number }[];
  /** 30 ngày gần nhất */
  botReplies30: number;
  botFailed30: number;
  promptTokens30: number;
  completionTokens30: number;
  imagesSent7: number;
  imagesFailed7: number;
};

const num = (v: unknown) => Number(v ?? 0);

export async function loadZaloStats(): Promise<ZaloStats> {
  const tz = getEnv().APP_TIMEZONE;
  const today = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const start7 = zonedStartOfDay(days[0], tz) ?? new Date(Date.now() - 7 * 86400_000);
  const start30 = zonedStartOfDay(addDays(today, -29), tz) ?? new Date(Date.now() - 30 * 86400_000);

  const [roles, unread, waiting, msgs, bot30, botFailed30, tokens, sent, failed] = await Promise.all([
    db.zaloContact.groupBy({ by: ["role", "chatType"], _count: { _all: true } }),
    db.zaloContact.count({ where: { unreadCount: { gt: 0 }, role: "CUSTOMER" } }),
    db.zaloContact.count({ where: { needsHuman: true, role: "CUSTOMER" } }),
    db.zaloMessage.findMany({ where: { createdAt: { gte: start7 }, failed: false }, select: { createdAt: true, direction: true, author: true } }),
    db.zaloMessage.count({ where: { author: "BOT", direction: "OUT", failed: false, createdAt: { gte: start30 } } }),
    db.zaloMessage.count({ where: { author: "SYSTEM", failed: true, createdAt: { gte: start30 } } }),
    db.zaloMessage.aggregate({ where: { author: "BOT", createdAt: { gte: start30 } }, _sum: { promptTokens: true, completionTokens: true } }),
    db.zaloDelivery.count({ where: { status: "SENT", updatedAt: { gte: start7 } } }),
    db.zaloDelivery.count({ where: { status: "FAILED", updatedAt: { gte: start7 } } }),
  ]);

  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const byDay = new Map(days.map((d) => [d, { day: d, incoming: 0, bot: 0, human: 0 }]));
  for (const m of msgs) {
    const p = byDay.get(fmt.format(m.createdAt));
    if (!p) continue;
    if (m.direction === "IN") p.incoming++;
    else if (m.author === "BOT") p.bot++;
    else if (m.author === "HUMAN") p.human++;
  }

  const count = (pred: (r: (typeof roles)[number]) => boolean) => roles.filter(pred).reduce((n, r) => n + r._count._all, 0);
  return {
    customers: count((r) => r.role === "CUSTOMER" && r.chatType === "PRIVATE"),
    groups: count((r) => r.chatType === "GROUP"),
    staff: count((r) => r.role === "STAFF"),
    unread,
    waiting,
    daily: days.map((d) => byDay.get(d)!),
    botReplies30: bot30,
    botFailed30,
    promptTokens30: num(tokens._sum.promptTokens),
    completionTokens30: num(tokens._sum.completionTokens),
    imagesSent7: sent,
    imagesFailed7: failed,
  };
}
