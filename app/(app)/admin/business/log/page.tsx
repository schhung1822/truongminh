import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { isAiRole } from "@/lib/knowledge/roles";
import { ROLE_SHORT } from "../article-schema";

export const metadata: Metadata = { title: "Nhật ký dùng kiến thức" };

function ids(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export default async function KnowledgeLogPage() {
  await requireAdmin();
  const uses = await db.knowledgeUse.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  const articleIds = [...new Set(uses.flatMap((u) => [...ids(u.usedIds), ...ids(u.droppedIds)]))];
  const userIds = [...new Set(uses.map((u) => u.userId).filter((x): x is string => !!x))];
  const [articles, users] = await Promise.all([
    articleIds.length ? db.knowledgeArticle.findMany({ where: { id: { in: articleIds } }, select: { id: true, title: true } }) : [],
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
  ]);
  const title = new Map(articles.map((a) => [a.id, a.title]));
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" });

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        50 lượt AI trả lời gần nhất và những bài kiến thức đã đưa vào prompt. Dùng để kiểm tra khi AI trả lời sai: xem nó đã đọc bài nào, và bài nào bị bỏ vì quá ngân sách.
      </p>
      {uses.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">Chưa có dữ liệu: chưa có lượt AI nào dùng kho kiến thức.</div>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Thời gian</TableHead>
                  <TableHead>Vai AI</TableHead>
                  <TableHead>Câu hỏi</TableHead>
                  <TableHead>Bài đã dùng</TableHead>
                  <TableHead className="pr-4">Kết quả</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uses.map((u) => {
                  const used = ids(u.usedIds);
                  const dropped = ids(u.droppedIds);
                  return (
                    <TableRow key={u.id} className="align-top">
                      <TableCell className="py-2 pl-4 text-xs whitespace-nowrap text-muted-foreground">
                        {fmt.format(u.createdAt)}
                        {u.userId && <div>{userName.get(u.userId) ?? "Tài khoản đã xóa"}</div>}
                      </TableCell>
                      <TableCell className="py-2">{isAiRole(u.role) ? ROLE_SHORT[u.role] : u.role}</TableCell>
                      <TableCell className="max-w-72 py-2 whitespace-normal">{u.question}</TableCell>
                      <TableCell className="max-w-96 py-2 whitespace-normal">
                        {used.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Không có bài nào</span>
                        ) : (
                          <ul className="list-disc pl-4 text-xs">
                            {used.map((id) => (
                              <li key={id}>
                                {title.has(id) ? (
                                  <Link href={`/admin/business/articles/${id}`} className="underline-offset-4 hover:underline">
                                    {title.get(id)}
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground">(bài đã bị xóa)</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {dropped.length > 0 && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{dropped.length} bài bị bỏ vì quá ngân sách</p>}
                      </TableCell>
                      <TableCell className="py-2 pr-4">{u.unknown ? <Badge variant="destructive">Chưa có thông tin</Badge> : <Badge variant="secondary">Đã trả lời</Badge>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
