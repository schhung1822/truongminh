import "server-only";
import { db } from "@/lib/db";
import type { RankItem } from "@/lib/stats/queries";
import { dayKey } from "@/lib/time";

export const LEAD_STATUS_ORDER = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST", "INVALID"] as const;
export type LeadFunnel = Record<(typeof LEAD_STATUS_ORDER)[number], number>;

export type SaleLeadRow = { id: string; name: string; total: number; won: number };

/**
 * Phễu của các bài tìm nhà sản xuất (v1.1 mục 6): comment của người khác trên bài tìm nhà sản xuất, rồi các lead nhà sản xuất
 * tạo trong khoảng đang xem đi qua từng bước. Mỗi bước đếm độc lập (không bắt buộc qua bước trước), nên "đã gửi mẫu" có thể
 * lớn hơn "đã chào" khi sale gọi thẳng mà không cần câu chào.
 */
export type SupplierFunnel = {
  comments: number;
  leads: number;
  manufacturers: number;
  offered: number;
  contacted: number;
  sampleSent: number;
  won: number;
};

export const SUPPLIER_FUNNEL_STEPS: { key: keyof SupplierFunnel; label: string; hint: string }[] = [
  { key: "comments", label: "Comment", hint: "Comment của người khác trên bài tìm nhà sản xuất" },
  { key: "manufacturers", label: "Xưởng thật", hint: "Lead được xếp là xưởng trực tiếp" },
  { key: "offered", label: "Đã chào", hint: "Câu mời dùng vật liệu đã gửi" },
  { key: "contacted", label: "Đã liên hệ được", hint: "Sale đã gọi hoặc nhắn Zalo" },
  { key: "sampleSent", label: "Đã gửi mẫu", hint: "Sale đánh dấu đã gửi mẫu" },
  { key: "won", label: "Có đơn vật liệu", hint: "Lead ở trạng thái Chốt đơn" },
];

export async function loadSupplierFunnel(start: Date, end: Date): Promise<SupplierFunnel> {
  const created = { createdAt: { gte: start, lt: end } };
  const lead = { ...created, leadType: "SUPPLIER" as const };
  const [comments, leads, manufacturers, offered, contacted, sampleSent, won] = await Promise.all([
    db.fbComment.count({ where: { ...created, isOwn: false, post: { purpose: "FIND_SUPPLIER" } } }),
    db.fbLead.count({ where: lead }),
    db.fbLead.count({ where: { ...lead, supplierType: "MANUFACTURER" } }),
    db.fbLead.count({ where: { ...lead, lastOfferedAt: { not: null } } }),
    db.fbLead.count({ where: { ...lead, OR: [{ calledAt: { not: null } }, { zaloMessagedAt: { not: null } }] } }),
    db.fbLead.count({ where: { ...lead, sampleSentAt: { not: null } } }),
    db.fbLead.count({ where: { ...lead, status: "WON" } }),
  ]);
  return { comments, leads, manufacturers, offered, contacted, sampleSent, won };
}

export type LeadStats = {
  total: number;
  funnel: LeadFunnel;
  /** lead tạo mỗi ngày, cùng thứ tự với `days` truyền vào */
  byDay: { day: string; count: number }[];
  topGroups: RankItem[];
  /** theo sale ĐANG được gán hiện tại (không phải lịch sử gán), sắp theo tổng lead giảm dần */
  bySale: SaleLeadRow[];
};

/**
 * Số liệu Lead Facebook trong khoảng [start, end). Gom theo ngày tạo tính bằng JS (không bằng SQL) để tính đúng theo
 * múi giờ cấu hình, vì bảng fb_leads không có cột "day" tính sẵn như usage_logs.
 */
export async function loadLeadStats(start: Date, end: Date, days: string[], tz: string): Promise<LeadStats> {
  const where = { createdAt: { gte: start, lt: end } };
  const [statusGroups, createdAts, groupRows, assignedLeads] = await Promise.all([
    db.fbLead.groupBy({ by: ["status"], where, _count: { _all: true } }),
    db.fbLead.findMany({ where, select: { createdAt: true } }),
    db.fbLead.groupBy({ by: ["groupId"], where: { ...where, groupId: { not: null } }, _count: { _all: true } }),
    db.fbLead.findMany({ where: { ...where, assignedToId: { not: null } }, select: { assignedToId: true, status: true } }),
  ]);

  const funnel = Object.fromEntries(LEAD_STATUS_ORDER.map((s) => [s, 0])) as LeadFunnel;
  let total = 0;
  for (const g of statusGroups) {
    funnel[g.status as keyof LeadFunnel] = g._count._all;
    total += g._count._all;
  }

  const dayCounts = new Map<string, number>();
  for (const l of createdAts) {
    const k = dayKey(l.createdAt, tz);
    dayCounts.set(k, (dayCounts.get(k) ?? 0) + 1);
  }
  const byDay = days.map((day) => ({ day, count: dayCounts.get(day) ?? 0 }));

  const groupIds = groupRows.map((g) => g.groupId).filter((id): id is string => !!id);
  const groupNames = groupIds.length
    ? new Map((await db.fbGroup.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true } })).map((g) => [g.id, g.name]))
    : new Map<string, string>();
  const topGroups: RankItem[] = groupRows
    .map((g) => ({ id: g.groupId as string, label: groupNames.get(g.groupId as string) ?? "(đã xóa)", value: g._count._all }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const saleCounts = new Map<string, { total: number; won: number }>();
  for (const l of assignedLeads) {
    const id = l.assignedToId as string;
    const cur = saleCounts.get(id) ?? { total: 0, won: 0 };
    cur.total += 1;
    if (l.status === "WON") cur.won += 1;
    saleCounts.set(id, cur);
  }
  const saleIds = [...saleCounts.keys()];
  const users = saleIds.length ? await db.user.findMany({ where: { id: { in: saleIds } }, select: { id: true, name: true } }) : [];
  const bySale: SaleLeadRow[] = users
    .map((u) => ({ id: u.id, name: u.name, ...(saleCounts.get(u.id) ?? { total: 0, won: 0 }) }))
    .sort((a, b) => b.total - a.total);

  return { total, funnel, byDay, topGroups, bySale };
}
