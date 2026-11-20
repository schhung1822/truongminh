import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { isAiRole } from "@/lib/knowledge/roles";
import { ROLE_SHORT } from "../article-schema";
import { GapActions } from "./gap-actions";

export const metadata: Metadata = { title: "Câu hỏi chưa trả lời" };

const FILTERS = [
  { key: "OPEN", label: "Chưa xử lý" },
  { key: "RESOLVED", label: "Đã xử lý" },
  { key: "ALL", label: "Tất cả" },
] as const;

export default async function GapsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin();
  const { status: raw } = await searchParams;
  const filter = raw === "RESOLVED" || raw === "ALL" ? raw : "OPEN";

  const [rows, open, resolved] = await Promise.all([
    db.knowledgeGap.findMany({
      where: filter === "ALL" ? {} : { status: filter },
      orderBy: [{ lastAskedAt: "desc" }],
      take: 300,
    }),
    db.knowledgeGap.count({ where: { status: "OPEN" } }),
    db.knowledgeGap.count({ where: { status: "RESOLVED" } }),
  ]);
  const counts = { OPEN: open, RESOLVED: resolved, ALL: open + resolved };
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Những câu hỏi AI báo &quot;chưa có thông tin&quot; để trả lời, gom theo nội dung. Bấm <b>Viết bài mới</b> để bổ sung kiến thức; câu hỏi lặp lại nhiều lần nên được xử lý trước. Nếu câu đã xử lý bị hỏi lại, nó tự về
        &quot;Chưa xử lý&quot;.
      </p>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo trạng thái">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "OPEN" ? "/admin/business/gaps" : `/admin/business/gaps?status=${f.key}`}
            aria-current={filter === f.key ? "page" : undefined}
            className={cn(buttonVariants({ variant: filter === f.key ? "secondary" : "outline", size: "sm" }), "h-8")}
          >
            {f.label} ({counts[f.key]})
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          {filter === "OPEN" ? "Chưa có dữ liệu: chưa có câu hỏi nào AI không trả lời được." : "Không có câu hỏi nào trong mục này."}
        </div>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Câu hỏi</TableHead>
                  <TableHead>Vai AI</TableHead>
                  <TableHead className="text-right">Số lần</TableHead>
                  <TableHead>Hỏi gần nhất</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="pr-4 text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="max-w-96 py-2 pl-4 whitespace-normal">{g.question}</TableCell>
                    <TableCell>{isAiRole(g.role) ? ROLE_SHORT[g.role] : g.role}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.count}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmt.format(g.lastAskedAt)}</TableCell>
                    <TableCell>
                      <Badge variant={g.status === "OPEN" ? "destructive" : "secondary"}>{g.status === "OPEN" ? "Chưa xử lý" : "Đã xử lý"}</Badge>
                    </TableCell>
                    <TableCell className="pr-4">
                      <GapActions id={g.id} status={g.status} question={g.question} writeHref={`/admin/business/articles/new?${new URLSearchParams({ title: g.question.slice(0, 200) })}`} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
