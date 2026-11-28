import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { db } from "@/lib/db";
import { requireFbManager } from "@/lib/fb/access";
import { GroupEditDialog, GroupForm } from "./groups-client";

export const metadata: Metadata = { title: "Nhóm Facebook" };

const PURPOSE_LABEL = { FIND_CUSTOMER: "Tìm khách", FIND_SUPPLIER: "Tìm bên sản xuất", BOTH: "Cả hai" } as const;
const STATUS_LABEL = { ACTIVE: "Đang hoạt động", PAUSED: "Tạm dừng", BANNED: "Bị chặn" } as const;
const SORTS = ["posts", "leads", "ratio"] as const;
type Sort = (typeof SORTS)[number];

type Params = { sort?: string };

/** Tiêu đề cột bấm được để sắp xếp (nhiều → ít); mục đang chọn có mũi tên. */
function SortHead({ sort, current, children }: { sort: Sort; current: Sort | null; children: ReactNode }) {
  const active = sort === current;
  return (
    <TableHead className="text-right">
      <Link href={active ? "/fb/groups" : `/fb/groups?sort=${sort}`} className={cn("inline-flex items-center gap-1 hover:underline", active && "font-semibold text-foreground")}>
        {children}
        {active && <ArrowDownIcon className="size-3" />}
      </Link>
    </TableHead>
  );
}

export default async function FbGroupsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireFbManager();
  const params = await searchParams;
  const sort = (SORTS as readonly string[]).includes(params.sort ?? "") ? (params.sort as Sort) : null;

  const [groups, postCounts, leadCounts] = await Promise.all([
    db.fbGroup.findMany({ orderBy: { createdAt: "desc" } }),
    db.fbPost.groupBy({ by: ["groupId"], _count: { _all: true } }),
    db.fbLead.groupBy({ by: ["groupId"], _count: { _all: true } }),
  ]);
  const posts = new Map(postCounts.map((r) => [r.groupId, r._count._all]));
  const leads = new Map(leadCounts.map((r) => [r.groupId, r._count._all]));

  const rows = groups.map((g) => {
    const p = posts.get(g.id) ?? 0;
    const l = leads.get(g.id) ?? 0;
    return { g, p, l, ratio: p > 0 ? l / p : 0 };
  });
  if (sort) rows.sort((a, b) => (sort === "ratio" ? b.ratio - a.ratio : sort === "leads" ? b.l - a.l : b.p - a.p));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Nhóm Facebook</h1>
        <p className="text-muted-foreground">Các nhóm đã đăng bài, kèm ghi chú quy định và số lead thu được để biết nhóm nào hiệu quả. Bấm tiêu đề cột số để sắp xếp theo nhóm hiệu quả nhất.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thêm nhóm</CardTitle>
          <CardDescription>Nhóm cũng được tự tạo khi thêm bài trong nhóm đó.</CardDescription>
        </CardHeader>
        <CardContent>
          <GroupForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách ({groups.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có nhóm nào.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nhóm</TableHead>
                  <TableHead>Chủ đề</TableHead>
                  <TableHead>Mục đích</TableHead>
                  <SortHead sort="posts" current={sort}>
                    Bài đã đăng
                  </SortHead>
                  <SortHead sort="leads" current={sort}>
                    Lead
                  </SortHead>
                  <SortHead sort="ratio" current={sort}>
                    Lead / bài
                  </SortHead>
                  <TableHead title="Nhóm có cho fanpage tham gia không">Page được vào</TableHead>
                  <TableHead title="Fanpage của xưởng đã vào nhóm chưa; đã vào thì câu mời nhà sản xuất đứng tên fanpage">Page đã vào</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ g, p, l, ratio }) => (
                  <TableRow key={g.id}>
                    <TableCell className="max-w-64">
                      <a href={g.url} target="_blank" rel="noreferrer noopener" className="block truncate font-medium underline underline-offset-4">
                        {g.name}
                      </a>
                      {g.notes && <span className="line-clamp-2 text-xs text-muted-foreground">{g.notes}</span>}
                    </TableCell>
                    <TableCell>{g.topic ?? "-"}</TableCell>
                    <TableCell>{PURPOSE_LABEL[g.purpose]}</TableCell>
                    <TableCell className="text-right tabular-nums">{p}</TableCell>
                    <TableCell className="text-right tabular-nums">{l}</TableCell>
                    <TableCell className="text-right tabular-nums">{p > 0 ? ratio.toFixed(1) : "-"}</TableCell>
                    <TableCell>{g.pageAllowed ? "Có" : <span className="text-muted-foreground">Không / chưa rõ</span>}</TableCell>
                    <TableCell>{g.pageJoined ? <Badge variant="outline">Đã vào</Badge> : <span className="text-muted-foreground">Chưa</span>}</TableCell>
                    <TableCell>
                      <Badge variant={g.status === "ACTIVE" ? "default" : g.status === "BANNED" ? "destructive" : "secondary"}>{STATUS_LABEL[g.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <GroupEditDialog group={{ id: g.id, name: g.name, topic: g.topic ?? "", purpose: g.purpose, notes: g.notes ?? "", status: g.status, pageAllowed: g.pageAllowed, pageJoined: g.pageJoined }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
