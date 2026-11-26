import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACTIVITY_GROUPS, actionsOfGroup, activityInfo, isActivityGroup } from "@/lib/activity-types";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/fb/format";
import { pageWindow } from "@/lib/pagination";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Nhật ký hoạt động" };

const PAGE_SIZE = 50;

type Params = { group?: string; user?: string; page?: string };

function hrefWith(current: Params, patch: Partial<Params>): string {
  const next = { ...current, ...patch };
  const sp = new URLSearchParams();
  if (next.group) sp.set("group", next.group);
  if (next.user) sp.set("user", next.user);
  if (next.page && next.page !== "1") sp.set("page", next.page);
  const qs = sp.toString();
  return qs ? `/admin/activity?${qs}` : "/admin/activity";
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn("rounded-full border px-3 py-1 text-sm transition-colors", active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
    >
      {children}
    </Link>
  );
}

/**
 * Nhật ký hoạt động (docs/DECISIONS.md D118): ai đăng nhập lúc nào, ai tạo/khóa tài khoản, đổi vai trò, tạo/thu hồi mã,
 * thêm/gỡ kết nối. Chỉ quản trị viên xem. Chỉ đọc: nhật ký không sửa, không xóa tay được; dòng quá một năm tự dọn.
 */
export default async function ActivityPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const group = isActivityGroup(params.group) ? params.group : undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const users = await db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const actorId = users.some((u) => u.id === params.user) ? params.user : undefined;
  const current: Params = { group, user: actorId };

  const where = { ...(group ? { action: { in: actionsOfGroup(group) as string[] } } : {}), ...(actorId ? { actorId } : {}) };
  const [total, rows] = await Promise.all([
    db.activityLog.count({ where }),
    db.activityLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Nhật ký hoạt động</h1>
        <p className="max-w-3xl text-muted-foreground">
          Ghi lại việc đăng nhập, quản lý tài khoản và thay đổi kết nối, để khi cần biết ai đã làm gì, lúc nào. Chỉ để xem, không sửa hay xóa được; dòng cũ hơn một năm tự dọn.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{total.toLocaleString("vi-VN")} dòng</CardTitle>
          <CardDescription className="flex flex-col gap-3 pt-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1">Loại việc:</span>
              <Chip href={hrefWith(current, { group: undefined, page: "1" })} active={!group}>
                Tất cả
              </Chip>
              {ACTIVITY_GROUPS.map((g) => (
                <Chip key={g.id} href={hrefWith(current, { group: g.id, page: "1" })} active={group === g.id}>
                  {g.label}
                </Chip>
              ))}
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1">Người làm:</span>
              <Chip href={hrefWith(current, { user: undefined, page: "1" })} active={!actorId}>
                Mọi người
              </Chip>
              {users.map((u) => (
                <Chip key={u.id} href={hrefWith(current, { user: u.id, page: "1" })} active={actorId === u.id}>
                  {u.name}
                </Chip>
              ))}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Chưa có dòng nào khớp bộ lọc. Nhật ký bắt đầu ghi từ khi có chức năng này.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lúc</TableHead>
                  <TableHead>Người làm</TableHead>
                  <TableHead>Việc</TableHead>
                  <TableHead>Đối tượng</TableHead>
                  <TableHead>Chi tiết</TableHead>
                  <TableHead>Địa chỉ mạng</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const info = activityInfo(r.action);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</TableCell>
                      <TableCell className="max-w-48 truncate" title={r.actorName}>
                        {r.actorName}
                      </TableCell>
                      <TableCell>
                        <span className={cn("whitespace-nowrap", info.tone === "warn" && "font-medium text-amber-700")}>{info.label}</span>
                      </TableCell>
                      <TableCell className="max-w-60 truncate" title={r.target ?? undefined}>
                        {r.target ?? ""}
                      </TableCell>
                      <TableCell className="max-w-md text-sm text-muted-foreground">{r.detail ?? ""}</TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">{r.ip ?? ""}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {pages > 1 && (
        <nav aria-label="Phân trang" className="flex flex-wrap items-center justify-center gap-1.5">
          {pageWindow(page, pages).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Chip key={n} href={hrefWith(current, { page: String(n) })} active={n === page}>
                {n}
              </Chip>
            ),
          )}
        </nav>
      )}
    </div>
  );
}
