import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnv } from "@/lib/env";
import { issueKindInfo } from "@/lib/zalo/agent/issue-kinds";
import type { IssueReport } from "@/lib/zalo/agent/issues";
import { cn } from "@/lib/utils";

/**
 * Nhật ký sự cố của trợ lý nhận lệnh (docs/DECISIONS.md D130): mỗi lần trợ lý xử lý hỏng một lệnh, hoặc AI trả lời lệch quy ước.
 * Chỉ quản trị viên xem (trang Cài đặt Zalo đã chặn), vì dòng chi tiết có lỗi gốc của máy chủ và nguyên văn câu AI trả lời.
 */
export function AssistantIssuesCard({ report }: { report: IssueReport | null }) {
  if (!report) {
    return (
      <Card id="loi-tro-ly" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Sự cố của trợ lý nhận lệnh</CardTitle>
          <CardDescription className="text-red-700">
            Chưa đọc được nhật ký sự cố. Thường do máy chủ đã cập nhật mã nhưng chưa cập nhật CSDL: chạy lại bash deploy/update-pm2.sh (hoặc npx prisma migrate deploy).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: getEnv().APP_TIMEZONE });
  const soft = report.total - report.visible;

  return (
    <Card id="loi-tro-ly" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Sự cố của trợ lý nhận lệnh
          {report.total > 0 && <Badge variant={report.visible > 0 ? "destructive" : "secondary"}>{report.visible} lần người ra lệnh thấy lỗi</Badge>}
        </CardTitle>
        <CardDescription>
          {report.days} ngày gần nhất. Ghi lại mỗi lần trợ lý không xử lý được một lệnh, và cả những lần AI trả lời lệch nhưng trợ lý tự nhắc lại được, để biết cần chỉnh gì. Lỗi của
          từng ảnh tạo hỏng xem ở{" "}
          <Link href="/admin/usage#loi" className="underline underline-offset-4">
            Quản trị &gt; Thống kê
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {report.total === 0 ? (
          <p className="text-sm text-muted-foreground">Không có sự cố nào trong {report.days} ngày qua.</p>
        ) : (
          <>
            <ul className="grid gap-2 lg:grid-cols-2">
              {report.byKind.map((k) => (
                <li key={k.kind} className={cn("flex gap-3 rounded-lg border p-3", k.visible ? "border-red-200" : "border-dashed")}>
                  <span className={cn("w-10 shrink-0 text-right text-xl font-semibold tabular-nums", k.visible && "text-red-600")}>{k.count.toLocaleString("vi-VN")}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{k.label}</span>
                    {k.advice && <span className="block text-xs text-muted-foreground">{k.advice}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {soft > 0 && <p className="text-xs text-muted-foreground">Ô viền đứt là lần AI trả lời lệch mà trợ lý tự xử lý tiếp được: người ra lệnh không thấy lỗi, chỉ chậm hơn một nhịp.</p>}

            <div>
              <p className="mb-1 text-sm font-medium">
                {report.recent.length < report.total ? `${report.recent.length} sự cố mới nhất (trên ${report.total.toLocaleString("vi-VN")})` : "Các sự cố, mới nhất trước"}
              </p>
              <ul className="flex flex-col divide-y">
                {report.recent.map((r) => {
                  const info = issueKindInfo(r.kind);
                  return (
                    <li key={r.id} className="flex flex-col gap-1 py-2.5 text-sm">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-muted-foreground tabular-nums">{fmt.format(r.createdAt)}</span>
                        <Badge variant={r.visible ? "destructive" : "outline"}>{info.label}</Badge>
                        {r.staffName && <span className="font-medium">{r.staffName}</span>}
                        <span className="text-muted-foreground">{r.isGroup ? `Nhóm ${r.chatName ?? "(chưa đặt tên)"}` : "Chat riêng với bot"}</span>
                        {r.tool && <span className="text-xs text-muted-foreground">Lệnh: {r.tool}</span>}
                      </div>
                      {r.command && <p className="wrap-break-word">Người ra lệnh nhắn: “{r.command.length > 300 ? `${r.command.slice(0, 300)}…` : r.command}”</p>}
                      {r.detail && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground select-none">Chi tiết{r.model ? ` (model ${r.model})` : ""}</summary>
                          <p className="mt-1 rounded-md bg-muted p-2 wrap-break-word whitespace-pre-wrap text-red-700">{r.detail}</p>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
