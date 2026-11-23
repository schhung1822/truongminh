import type { Metadata } from "next";
import { SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { canManageFb } from "@/lib/fb/access";
import { fmtDateTime } from "@/lib/fb/format";
import { zonedStartOfDay } from "@/lib/time";
import { LeadDetailDialog, QuickStatus, STATUS_LABEL, type LeadRow } from "./leads-client";

export const metadata: Metadata = { title: "Lead Facebook" };

const LIMIT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_VALUES = Object.keys(STATUS_LABEL);

type Params = { q?: string; status?: string; group?: string; assigned?: string; type?: string; from?: string; to?: string };

export default async function FbLeadsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const manager = canManageFb(user.role);
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const tz = getEnv().APP_TIMEZONE;
  const fromDate = zonedStartOfDay(params.from ?? "", tz);
  const toStart = zonedStartOfDay(params.to ?? "", tz);
  const toEnd = toStart ? new Date(toStart.getTime() + DAY_MS) : null;
  const status = STATUS_VALUES.includes(params.status ?? "") ? (params.status as LeadRow["status"]) : "";
  const type = params.type === "CUSTOMER" || params.type === "SUPPLIER" ? params.type : "";
  const group = params.group ?? "";
  const assigned = params.assigned ?? "";
  const filtering = !!(q || status || type || group || assigned || fromDate || toEnd);

  const and: Prisma.FbLeadWhereInput[] = [];
  if (!manager) and.push({ assignedToId: user.id }); // sale chỉ thấy lead được gán cho mình
  else if (assigned === "me") and.push({ assignedToId: user.id });
  else if (assigned === "none") and.push({ assignedToId: null });
  else if (assigned) and.push({ assignedToId: assigned });
  if (status) and.push({ status: status as Prisma.FbLeadWhereInput["status"] });
  if (type) and.push({ leadType: type });
  if (group) and.push({ groupId: group });
  if (fromDate || toEnd) and.push({ createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toEnd ? { lt: toEnd } : {}) } });
  if (q) and.push({ OR: [{ name: { contains: q } }, { phone: { contains: q.replace(/[\s.\-]/g, "") } }, { email: { contains: q } }, { zalo: { contains: q.replace(/[\s.\-]/g, "") } }] });

  const [leads, groups, users, newCount] = await Promise.all([
    db.fbLead.findMany({
      where: { AND: and },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      include: {
        group: { select: { name: true } },
        post: { select: { url: true } },
        customer: { select: { name: true } },
        comment: { select: { text: true } },
        _count: { select: { sources: true } },
      },
    }),
    manager ? db.fbGroup.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    manager ? db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve(null),
    db.fbLead.count({ where: { AND: [...and.filter((c) => !("status" in c)), { status: "NEW" }] } }),
  ]);
  const userName = new Map((users ?? []).map((u) => [u.id, u.name]));

  const rows: LeadRow[] = leads.map((l) => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    zalo: l.zalo,
    email: l.email,
    profileUrl: l.profileUrl,
    leadType: l.leadType,
    status: l.status,
    assignedToId: l.assignedToId,
    customerId: l.customerId,
    customerName: l.customer?.name ?? null,
    note: l.note ?? "",
    groupName: l.group?.name ?? null,
    postUrl: l.post.url,
    snippet: l.comment.text.slice(0, 120),
    createdAt: fmtDateTime(l.createdAt),
    sourceCount: l._count.sources,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Lead Facebook</h1>
        <p className="text-muted-foreground">
          {manager ? "Khách để lại số điện thoại hoặc liên hệ trong comment trên các bài đang theo dõi." : "Các lead được gán cho bạn."}{" "}
          {newCount > 0 && <Badge>{newCount} lead mới</Badge>}
        </p>
      </div>

      <Card>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" action="/fb/leads">
            <div className="relative lg:col-span-2">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={q} placeholder="Tìm theo tên, số điện thoại, Zalo, email" className="h-10 pl-9" />
            </div>
            <NativeSelect name="status" defaultValue={status} aria-label="Trạng thái">
              <option value="">Mọi trạng thái</option>
              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="type" defaultValue={type} aria-label="Loại lead">
              <option value="">Khách và bên sản xuất</option>
              <option value="CUSTOMER">Tìm khách</option>
              <option value="SUPPLIER">Tìm bên sản xuất</option>
            </NativeSelect>
            {manager && (
              <>
                <NativeSelect name="group" defaultValue={group} aria-label="Nhóm">
                  <option value="">Mọi nhóm</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect name="assigned" defaultValue={assigned} aria-label="Sale phụ trách">
                  <option value="">Mọi người phụ trách</option>
                  <option value="me">Gán cho tôi</option>
                  <option value="none">Chưa gán</option>
                  {(users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </NativeSelect>
              </>
            )}
            <Input name="from" type="date" defaultValue={params.from ?? ""} aria-label="Từ ngày" className="h-10" />
            <Input name="to" type="date" defaultValue={params.to ?? ""} aria-label="Đến ngày" className="h-10" />
            <div className="flex gap-2">
              <Button type="submit" className="h-10 px-4">
                Lọc
              </Button>
              {filtering && (
                <Button type="button" variant="outline" className="h-10 px-4" render={<a href="/fb/leads" />}>
                  Xoá lọc
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {filtering ? "Không có lead nào khớp bộ lọc." : manager ? "Chưa có lead nào. Lead xuất hiện sau khi extension quét comment có số điện thoại." : "Chưa có lead nào được gán cho bạn."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Khách</TableHead>
                  <TableHead>Liên hệ</TableHead>
                  <TableHead>Nguồn</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Phụ trách</TableHead>
                  <TableHead>Lúc</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-48">
                      <div className="truncate font-medium">{r.name}</div>
                      <div className="truncate text-xs text-muted-foreground" title={r.snippet}>
                        {r.snippet}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.phone && <div className="select-all font-medium">{r.phone}</div>}
                      {r.zalo && r.zalo !== r.phone && <div className="text-xs">Zalo {r.zalo}</div>}
                      {r.email && <div className="text-xs">{r.email}</div>}
                    </TableCell>
                    <TableCell className="max-w-44 text-sm">
                      <div className="truncate">{r.groupName ?? "Trang cá nhân"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.leadType === "SUPPLIER" ? "Tìm bên sản xuất" : "Tìm khách"}
                        {r.sourceCount > 1 ? ` · ${r.sourceCount} comment` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <QuickStatus id={r.id} status={r.status} note={r.note} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.assignedToId ? (userName.get(r.assignedToId) ?? (r.assignedToId === user.id ? user.name : "Đã gán")) : <span className="text-muted-foreground">Chưa gán</span>}
                      {r.customerName && <div className="text-xs text-muted-foreground">Khách: {r.customerName}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{r.createdAt}</TableCell>
                    <TableCell className="text-right">
                      <LeadDetailDialog lead={r} assignable={users} canDelete={user.role === "ADMIN"} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {rows.length === LIMIT && <p className="pt-3 text-xs text-muted-foreground">Đang hiện {LIMIT} lead mới nhất. Dùng bộ lọc để thu hẹp.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
