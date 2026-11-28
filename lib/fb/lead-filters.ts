import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { canManageFb } from "@/lib/fb/access";
import { zonedStartOfDay } from "@/lib/time";

const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_VALUES = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST", "INVALID"] as const;

export type LeadFilterParams = {
  q?: string;
  status?: string;
  type?: string;
  group?: string;
  assigned?: string;
  from?: string;
  to?: string;
  /** "supplier" = tab Nhà sản xuất của trang Lead (v1.1): chỉ lead nhà sản xuất. */
  view?: string;
  /** Loại nhà sản xuất, chỉ có nghĩa ở tab Nhà sản xuất: MANUFACTURER | BROKER | UNKNOWN. */
  stype?: string;
};

export type ParsedLeadFilters = {
  where: Prisma.FbLeadWhereInput;
  /** điều kiện chưa gồm trạng thái, dùng để đếm số lead của từng trạng thái */
  base: Prisma.FbLeadWhereInput[];
  status: string;
  manager: boolean;
  filtering: boolean;
};

/**
 * Dựng điều kiện lọc lead từ query string. Dùng chung cho trang danh sách và route xuất CSV để hai nơi luôn lọc
 * giống nhau (đổi lọc ở trang thì nhớ đổi ở đây, không lặp lại logic ở nơi khác).
 */
export function parseLeadFilters(user: Pick<SessionUser, "id" | "role">, params: LeadFilterParams): ParsedLeadFilters {
  const manager = canManageFb(user.role);
  const q = (params.q ?? "").trim();
  const tz = getEnv().APP_TIMEZONE;
  const fromDate = zonedStartOfDay(params.from ?? "", tz);
  const toStart = zonedStartOfDay(params.to ?? "", tz);
  const toEnd = toStart ? new Date(toStart.getTime() + DAY_MS) : null;
  const status = (STATUS_VALUES as readonly string[]).includes(params.status ?? "") ? (params.status as string) : "";
  const supplierView = params.view === "supplier";
  const type = supplierView ? "SUPPLIER" : params.type === "CUSTOMER" || params.type === "SUPPLIER" ? params.type : "";
  const stype = supplierView && (params.stype === "MANUFACTURER" || params.stype === "BROKER" || params.stype === "UNKNOWN") ? params.stype : "";
  const group = params.group ?? "";
  const assigned = params.assigned ?? "";

  const base: Prisma.FbLeadWhereInput[] = [];
  if (!manager) base.push({ assignedToId: user.id }); // sale chỉ thấy lead được gán cho mình
  else if (assigned === "me") base.push({ assignedToId: user.id });
  else if (assigned === "none") base.push({ assignedToId: null });
  else if (assigned) base.push({ assignedToId: assigned });
  if (type) base.push({ leadType: type });
  if (stype) base.push({ supplierType: stype });
  if (group) base.push({ groupId: group });
  if (fromDate || toEnd) base.push({ createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toEnd ? { lt: toEnd } : {}) } });
  if (q) {
    base.push({
      OR: [{ name: { contains: q } }, { phone: { contains: q.replace(/[\s.\-]/g, "") } }, { email: { contains: q } }, { zalo: { contains: q.replace(/[\s.\-]/g, "") } }],
    });
  }

  const where: Prisma.FbLeadWhereInput = { AND: status ? [...base, { status: status as Prisma.FbLeadWhereInput["status"] }] : base };
  const filtering = !!(q || status || (type && !supplierView) || stype || group || assigned || fromDate || toEnd);
  return { where, base, status, manager, filtering };
}

/** Số lead "Mới" mà người này thấy được (sale: chỉ lead gán cho mình). Dùng cho số đếm trên menu bên trái. */
export async function getFbLeadNewCount(user: Pick<SessionUser, "id" | "role">): Promise<number> {
  return db.fbLead.count({ where: canManageFb(user.role) ? { status: "NEW" } : { status: "NEW", assignedToId: user.id } });
}
