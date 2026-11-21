import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireFbManager } from "@/lib/fb/access";
import { GroupEditDialog, GroupForm } from "./groups-client";

export const metadata: Metadata = { title: "Nhóm Facebook" };

const PURPOSE_LABEL = { FIND_CUSTOMER: "Tìm khách", FIND_SUPPLIER: "Tìm bên sản xuất", BOTH: "Cả hai" } as const;
const STATUS_LABEL = { ACTIVE: "Đang hoạt động", PAUSED: "Tạm dừng", BANNED: "Bị chặn" } as const;

export default async function FbGroupsPage() {
  await requireFbManager();
  const [groups, postCounts, leadCounts] = await Promise.all([
    db.fbGroup.findMany({ orderBy: { createdAt: "desc" } }),
    db.fbPost.groupBy({ by: ["groupId"], _count: { _all: true } }),
    db.fbLead.groupBy({ by: ["groupId"], _count: { _all: true } }),
  ]);
  const posts = new Map(postCounts.map((r) => [r.groupId, r._count._all]));
  const leads = new Map(leadCounts.map((r) => [r.groupId, r._count._all]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Nhóm Facebook</h1>
        <p className="text-muted-foreground">Các nhóm đã đăng bài, kèm ghi chú quy định và số lead thu được để biết nhóm nào hiệu quả.</p>
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
                  <TableHead className="text-right">Bài đã đăng</TableHead>
                  <TableHead className="text-right">Lead</TableHead>
                  <TableHead className="text-right">Lead / bài</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => {
                  const p = posts.get(g.id) ?? 0;
                  const l = leads.get(g.id) ?? 0;
                  return (
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
                      <TableCell className="text-right tabular-nums">{p > 0 ? (l / p).toFixed(1) : "-"}</TableCell>
                      <TableCell>
                        <Badge variant={g.status === "ACTIVE" ? "default" : g.status === "BANNED" ? "destructive" : "secondary"}>{STATUS_LABEL[g.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <GroupEditDialog group={{ id: g.id, name: g.name, topic: g.topic ?? "", purpose: g.purpose, notes: g.notes ?? "", status: g.status }} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
