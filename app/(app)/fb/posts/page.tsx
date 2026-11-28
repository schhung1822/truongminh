import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireFbManager } from "@/lib/fb/access";
import { fmtAgo, fmtDateTime } from "@/lib/fb/format";
import { parseMaterialIds } from "@/lib/fb/offer-rules";
import { pageWindow } from "@/lib/pagination";
import { AddPostForm, DraftExistingButton, PostOfferDialog, PurposeSelect, TrackingActions } from "./posts-client";

export const metadata: Metadata = { title: "Bài đăng theo dõi" };

const TRACKING_LABEL = { TRACKING: "Đang theo dõi", PAUSED: "Tạm dừng", DONE: "Đã xong" } as const;
const TRACKING_VALUES = Object.keys(TRACKING_LABEL);
const PAGE_SIZE = 50;

type Params = { q?: string; group?: string; account?: string; status?: string; page?: string };

export default async function FbPostsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireFbManager();
  const isAdmin = user.role === "ADMIN";
  const own: Prisma.FbPostWhereInput = isAdmin ? {} : { account: { userId: user.id } };

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const group = params.group ?? "";
  const account = params.account ?? "";
  const status = TRACKING_VALUES.includes(params.status ?? "") ? (params.status as string) : "";
  const filtering = !!(q || group || account || status);

  const where: Prisma.FbPostWhereInput = {
    AND: [
      own,
      group ? { groupId: group } : {},
      account ? { accountId: account } : {},
      status ? { trackingStatus: status as Prisma.FbPostWhereInput["trackingStatus"] } : {},
      q ? { OR: [{ url: { contains: q } }, { group: { name: { contains: q } } }] } : {},
    ],
  };

  const [total, accounts, groups, materialRows] = await Promise.all([
    db.fbPost.count({ where }),
    db.fbAccount.findMany({ where: isAdmin ? {} : { userId: user.id }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
    db.fbGroup.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // thư viện chất liệu của webapp, để chọn vật liệu gợi ý cho bài tìm nhà sản xuất (v1.1)
    db.material.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true, groupName: true, printTech: true } }),
  ]);
  const materials = materialRows.map((m) => ({ id: m.id, code: m.code, name: m.name, kind: [m.groupName, m.printTech].filter(Boolean).join(", ") }));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1), totalPages);
  const posts = await db.fbPost.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { account: { select: { displayName: true } }, group: { select: { name: true } } },
  });

  const href = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const cur: Record<string, string | undefined> = { q: q || undefined, group: group || undefined, account: account || undefined, status: status || undefined, ...over };
    for (const [k, v] of Object.entries(cur)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `/fb/posts?${s}` : "/fb/posts";
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Bài đăng theo dõi</h1>
        <p className="text-muted-foreground">Bài do bạn hoặc người khác đăng mà bạn chủ động theo dõi. Extension quét comment đang hiển thị cho nick đã chọn, tách số điện thoại và đưa vào mục Lead.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thêm bài</CardTitle>
          <CardDescription>Dán permalink của bài cần theo dõi. Nhóm chưa có trong danh sách sẽ được tạo tự động (đặt lại tên ở trang Nhóm).</CardDescription>
        </CardHeader>
        <CardContent>
          <AddPostForm accounts={accounts} materials={materials} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách ({total})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form method="get" action="/fb/posts" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={q} placeholder="Tìm theo đường dẫn bài hoặc tên nhóm" className="h-10 pl-9" />
            </div>
            <NativeSelect name="group" defaultValue={group} aria-label="Nhóm">
              <option value="">Mọi nhóm</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="account" defaultValue={account} aria-label="Nick quét">
              <option value="">Mọi nick</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="status" defaultValue={status} aria-label="Trạng thái">
              <option value="">Mọi trạng thái</option>
              {Object.entries(TRACKING_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
            <div className="flex gap-2">
              <Button type="submit" className="h-10 px-4">
                Lọc
              </Button>
              {filtering && (
                <Button type="button" variant="outline" className="h-10 px-4" render={<Link href="/fb/posts" />}>
                  Xoá lọc
                </Button>
              )}
            </div>
          </form>

          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{filtering ? "Không có bài nào khớp bộ lọc." : "Chưa có bài nào."}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bài</TableHead>
                    <TableHead>Nhóm</TableHead>
                    <TableHead>Nick quét</TableHead>
                    <TableHead className="text-right">Đã lưu / Facebook</TableHead>
                    <TableHead className="text-right">Lead</TableHead>
                    <TableHead>Quét cuối</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-56">
                        <a href={p.url} target="_blank" rel="noreferrer noopener" className="block truncate underline underline-offset-4" title={p.url}>
                          {p.url.replace("https://www.facebook.com/", "")}
                        </a>
                        <span className="mb-1 block text-xs text-muted-foreground">
                          {p.postedAt ? fmtDateTime(p.postedAt).split(",")[0] : "đưa vào " + fmtDateTime(p.createdAt).split(",")[0]}
                        </span>
                        <PurposeSelect id={p.id} purpose={p.purpose} />
                        {p.purpose === "FIND_SUPPLIER" && <PostOfferDialog id={p.id} productRef={p.productRef ?? ""} materialIds={parseMaterialIds(p.suggestedMaterialIds)} materials={materials} />}
                        {p.purpose === "FIND_SUPPLIER" && <DraftExistingButton id={p.id} commentCount={p.commentCount} />}
                      </TableCell>
                      <TableCell>{p.group?.name ?? <span className="text-muted-foreground">Trang cá nhân</span>}</TableCell>
                      <TableCell>{p.account.displayName}</TableCell>
                      <TableCell className="text-right tabular-nums" title="Số comment đã lưu / tổng Facebook hiển thị">
                        {p.commentCount}{p.reportedCommentCount != null ? ` / ${p.reportedCommentCount}` : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.leadCount}</TableCell>
                      <TableCell title={fmtDateTime(p.lastScannedAt)}>{fmtAgo(p.lastScannedAt)}</TableCell>
                      <TableCell>
                        <Badge variant={p.trackingStatus === "TRACKING" ? "default" : "secondary"}>{TRACKING_LABEL[p.trackingStatus]}</Badge>
                      </TableCell>
                      <TableCell>
                        <TrackingActions id={p.id} status={p.trackingStatus} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {totalPages > 1 && (
            <nav aria-label="Phân trang" className="flex flex-wrap items-center justify-center gap-1.5">
              <Button variant="outline" size="sm" disabled={page <= 1} render={page <= 1 ? undefined : <Link href={href({ page: String(page - 1) })} />} nativeButton={page <= 1}>
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
              <Button variant="outline" size="sm" disabled={page >= totalPages} render={page >= totalPages ? undefined : <Link href={href({ page: String(page + 1) })} />} nativeButton={page >= totalPages}>
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
