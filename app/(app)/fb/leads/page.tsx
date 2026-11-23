import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, InboxIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/fb/format";
import { parseLeadFilters } from "@/lib/fb/lead-filters";
import { pageWindow } from "@/lib/pagination";
import { LeadFilterForm } from "./lead-filter-form";
import { PAGE_SIZES, STATUS_LABEL, STATUS_TONE } from "./lead-status";
import { LeadsTable, type LeadRow } from "./leads-client";

export const metadata: Metadata = { title: "Lead Facebook" };

type Params = { q?: string; status?: string; group?: string; assigned?: string; type?: string; from?: string; to?: string; page?: string; size?: string; sort?: string };

export default async function FbLeadsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const type = params.type === "CUSTOMER" || params.type === "SUPPLIER" ? params.type : "";
  const group = params.group ?? "";
  const assigned = params.assigned ?? "";
  const oldestFirst = params.sort === "old";
  const pageSize = PAGE_SIZES.find((n) => String(n) === params.size) ?? PAGE_SIZES[0];
  const { where, base, status, manager, filtering } = parseLeadFilters(user, params);

  const [statusGroups, groups, users] = await Promise.all([
    db.fbLead.groupBy({ by: ["status"], where: { AND: base }, _count: { _all: true } }),
    manager ? db.fbGroup.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    manager ? db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve(null),
  ]);
  const countOf = new Map(statusGroups.map((g) => [g.status as string, g._count._all]));
  const allCount = statusGroups.reduce((s, g) => s + g._count._all, 0);
  const total = status ? (countOf.get(status) ?? 0) : allCount;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1), totalPages);

  const leads = await db.fbLead.findMany({
    where,
    orderBy: [{ createdAt: oldestFirst ? "asc" : "desc" }, { id: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      group: { select: { name: true } },
      post: { select: { url: true } },
      customer: { select: { name: true } },
      comment: { select: { text: true } },
      _count: { select: { sources: true } },
    },
  });
  const userNames: Record<string, string> = Object.fromEntries((users ?? []).map((u) => [u.id, u.name]));

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
    snippet: l.comment.text.slice(0, 160),
    createdAt: fmtDateTime(l.createdAt),
    sourceCount: l._count.sources,
  }));

  /** Link giữ nguyên các bộ lọc đang chọn, chỉ đổi những khóa được truyền vào (giá trị rỗng = bỏ khóa đó). */
  const href = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const cur: Record<string, string | undefined> = {
      q: q || undefined,
      status: status || undefined,
      type: type || undefined,
      group: group || undefined,
      assigned: assigned || undefined,
      from: params.from || undefined,
      to: params.to || undefined,
      sort: oldestFirst ? "old" : undefined,
      size: pageSize !== PAGE_SIZES[0] ? String(pageSize) : undefined,
      ...over,
    };
    for (const [k, v] of Object.entries(cur)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `/fb/leads?${s}` : "/fb/leads";
  };

  /** Xuất CSV đúng theo bộ lọc đang xem (không phân trang). */
  const exportHref = () => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, status, type, group, assigned, from: params.from, to: params.to, sort: oldestFirst ? "old" : undefined })) {
      if (v) sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `/api/fb/leads/export?${s}` : "/api/fb/leads/export";
  };

  const firstShown = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = Math.min(total, page * pageSize);
  const newCount = countOf.get("NEW") ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lead Facebook</h1>
          <p className="text-muted-foreground">
            {manager ? "Khách để lại số điện thoại hoặc liên hệ trong comment trên các bài đang theo dõi." : "Các lead được gán cho bạn."}
          </p>
        </div>
        {newCount > 0 && status !== "NEW" && (
          <Button variant="outline" render={<Link href={href({ status: "NEW", page: undefined })} />}>
            Có {newCount} lead mới chưa xử lý
          </Button>
        )}
      </div>

      {/* Nút lọc nhanh theo trạng thái, kèm số lượng */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Lọc theo trạng thái">
        <Link
          href={href({ status: undefined, page: undefined })}
          aria-current={status === "" ? "page" : undefined}
          className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${status === "" ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}
        >
          Tất cả <span className="ml-1 tabular-nums opacity-80">{allCount}</span>
        </Link>
        {Object.entries(STATUS_LABEL).map(([v, label]) => (
          <Link
            key={v}
            href={href({ status: v, page: undefined })}
            aria-current={status === v ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${status === v ? "border-foreground bg-foreground text-background" : `${STATUS_TONE[v]} hover:brightness-95`}`}
          >
            {label} <span className="ml-1 tabular-nums opacity-80">{countOf.get(v) ?? 0}</span>
          </Link>
        ))}
      </div>

      <Card>
        <CardContent>
          <LeadFilterForm>
            <input type="hidden" name="status" value={status} />
            <div className="relative lg:col-span-2">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={q} placeholder="Tìm theo tên, số điện thoại, Zalo, email, rồi nhấn Enter" className="h-10 pl-9" />
            </div>
            <NativeSelect name="type" defaultValue={type} aria-label="Loại lead">
              <option value="">Khách và bên sản xuất</option>
              <option value="CUSTOMER">Tìm khách</option>
              <option value="SUPPLIER">Tìm bên sản xuất</option>
            </NativeSelect>
            <NativeSelect name="sort" defaultValue={oldestFirst ? "old" : "new"} aria-label="Sắp xếp">
              <option value="new">Mới nhất trước</option>
              <option value="old">Cũ nhất trước</option>
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
            <Input name="from" type="date" defaultValue={params.from ?? ""} aria-label="Từ ngày" title="Từ ngày" className="h-10" />
            <Input name="to" type="date" defaultValue={params.to ?? ""} aria-label="Đến ngày" title="Đến ngày" className="h-10" />
            <NativeSelect name="size" defaultValue={String(pageSize)} aria-label="Số dòng mỗi trang">
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} dòng / trang
                </option>
              ))}
            </NativeSelect>
            <div className="flex gap-2">
              <Button type="submit" className="h-10 px-4">
                Lọc
              </Button>
              {filtering && (
                <Button type="button" variant="outline" className="h-10 px-4" render={<Link href="/fb/leads" />}>
                  Xoá lọc
                </Button>
              )}
            </div>
          </LeadFilterForm>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {total === 0 ? "Không có lead nào" : `Đang xem ${firstShown}–${lastShown} trên ${total} lead`}
              {filtering && total > 0 ? " (đã lọc)" : ""}
            </span>
            <div className="flex items-center gap-3">
              {total > 0 && (
                <a href={exportHref()} className="flex items-center gap-1 underline underline-offset-4 hover:text-foreground" title="Xuất danh sách đang xem ra file CSV (mở được bằng Excel)">
                  <DownloadIcon className="size-3.5" /> Xuất Excel
                </a>
              )}
              {totalPages > 1 && (
                <span>
                  Trang {page}/{totalPages}
                </span>
              )}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <InboxIcon className="size-8 opacity-60" />
              <p>
                {filtering
                  ? "Không có lead nào khớp bộ lọc."
                  : manager
                    ? "Chưa có lead nào. Lead xuất hiện sau khi extension quét được comment có số điện thoại."
                    : "Chưa có lead nào được gán cho bạn."}
              </p>
              {filtering && (
                <Button variant="outline" size="sm" render={<Link href="/fb/leads" />}>
                  Xoá lọc
                </Button>
              )}
            </div>
          ) : (
            <LeadsTable
              rows={rows}
              assignable={users}
              canDelete={user.role === "ADMIN"}
              currentUserId={user.id}
              currentUserName={user.name}
              userNames={userNames}
            />
          )}

          {totalPages > 1 && (
            <nav aria-label="Phân trang" className="flex flex-wrap items-center justify-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                render={page <= 1 ? undefined : <Link href={href({ page: String(page - 1) })} />}
                nativeButton={page <= 1}
              >
                <ChevronLeftIcon />
                Trước
              </Button>
              {pageWindow(page, totalPages).map((n, i) =>
                n === null ? (
                  <span key={`gap-${i}`} className="px-1 text-muted-foreground">
                    …
                  </span>
                ) : (
                  <Button
                    key={n}
                    variant={n === page ? "default" : "outline"}
                    size="sm"
                    className="min-w-8 tabular-nums"
                    aria-current={n === page ? "page" : undefined}
                    render={<Link href={href({ page: n === 1 ? undefined : String(n) })} />}
                    nativeButton={false}
                  >
                    {n}
                  </Button>
                ),
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                render={page >= totalPages ? undefined : <Link href={href({ page: String(page + 1) })} />}
                nativeButton={page >= totalPages}
              >
                Sau
                <ChevronRightIcon />
              </Button>
            </nav>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
