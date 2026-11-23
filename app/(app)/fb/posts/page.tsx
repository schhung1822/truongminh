import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireFbManager } from "@/lib/fb/access";
import { fmtAgo, fmtDateTime } from "@/lib/fb/format";
import { AddPostForm, PurposeSelect, TrackingActions } from "./posts-client";

export const metadata: Metadata = { title: "Bài đăng theo dõi" };

const TRACKING_LABEL = { TRACKING: "Đang theo dõi", PAUSED: "Tạm dừng", DONE: "Đã xong" } as const;

export default async function FbPostsPage() {
  const user = await requireFbManager();
  const isAdmin = user.role === "ADMIN";
  const own = isAdmin ? {} : { account: { userId: user.id } };

  const [posts, accounts] = await Promise.all([
    db.fbPost.findMany({
      where: own,
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { account: { select: { displayName: true } }, group: { select: { name: true } } },
    }),
    db.fbAccount.findMany({ where: isAdmin ? {} : { userId: user.id }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
  ]);

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
          <AddPostForm accounts={accounts} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách ({posts.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có bài nào.</p>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
