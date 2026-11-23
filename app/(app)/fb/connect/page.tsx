import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AlertTriangleIcon, CheckCircle2Icon, CircleHelpIcon, TriangleAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getFbConfig } from "@/lib/ext/config";
import { requireFbManager } from "@/lib/fb/access";
import { fmtAgo, fmtDateTime } from "@/lib/fb/format";
import { AccountActions, AccountForm, ConfigForm, RevokeButton, TokenForm } from "./connect-client";

export const metadata: Metadata = { title: "Kết nối extension" };

const STATUS_LABEL = { ACTIVE: "Đang hoạt động", PAUSED: "Tạm dừng", RESTRICTED: "Bị hạn chế" } as const;
const WARN_LABEL: Record<string, string> = {
  SELECTOR_BROKEN: "Không đọc được trang Facebook (giao diện có thể đã đổi)",
  CHECKPOINT: "Facebook yêu cầu xác minh / hạn chế nick",
  SCAN_FAIL: "Quét không trọn vẹn",
};
/** Lý do extension báo kèm trong detail.reason của SCAN_FAIL. */
const REASON_LABEL: Record<string, string> = {
  login_required: "Facebook hiện trang đăng nhập (hết phiên trên Chrome đó)",
  tab_timeout: "Trang Facebook tải quá lâu",
  content_unreachable: "Không nạp được bộ đọc trang vào tab Facebook",
  tab_closed: "Cửa sổ quét bị đóng giữa chừng",
  diagnostic: "Báo cáo chẩn đoán do nhân sự bấm gửi",
  partial: "Đọc chưa hết bài (quá giới hạn), chu kỳ sau quét lại",
};

function warnText(type: string, detail: unknown): { label: string; detail: string } {
  const d = (detail && typeof detail === "object" ? detail : {}) as Record<string, unknown>;
  const reason = typeof d.reason === "string" ? d.reason : d.complete === false ? "partial" : null;
  const label = type === "SCAN_FAIL" && reason ? (REASON_LABEL[reason] ?? `Lỗi quét: ${reason}`) : (WARN_LABEL[type] ?? type);
  const rest = Object.fromEntries(Object.entries(d).filter(([k]) => !["reason", "post_id"].includes(k)));
  const text = Object.keys(rest).length ? JSON.stringify(rest) : "";
  return { label, detail: text.length > 300 ? text.slice(0, 300) + "…" : text };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 3600_000);
}

type Health = "empty" | "red" | "yellow" | "green";

/**
 * Ô tổng quan dạng "đèn tín hiệu" ở đầu trang: để người không rành kỹ thuật chỉ cần nhìn một ô là biết có cần làm
 * gì không, không phải đọc hết bảng log phía dưới.
 */
function HealthBanner({ health, restrictedCount, warningCount }: { health: Health; restrictedCount: number; warningCount: number }) {
  const styles: Record<Health, { box: string; icon: ReactNode; title: string; detail: string }> = {
    empty: {
      box: "border-muted-foreground/30 bg-muted/40 text-foreground",
      icon: <CircleHelpIcon className="size-6 shrink-0 text-muted-foreground" />,
      title: "Chưa kết nối nick Facebook nào",
      detail: "Thêm nick Facebook ở mục \"Nick Facebook\" dưới đây rồi tạo mã kết nối để extension bắt đầu quét.",
    },
    red: {
      box: "border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200",
      icon: <AlertTriangleIcon className="size-6 shrink-0 text-red-600" />,
      title: "Cần xử lý ngay",
      detail: `${restrictedCount} nick đang bị Facebook hạn chế, không quét được. Xem mục "Nick Facebook" để kiểm tra lại.`,
    },
    yellow: {
      box: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
      icon: <TriangleAlertIcon className="size-6 shrink-0 text-amber-600" />,
      title: "Có cảnh báo cần xem",
      detail: `${warningCount} cảnh báo trong 14 ngày qua (xem bảng "Cảnh báo từ extension" dưới đây). Việc quét vẫn chạy nhưng có thể bị thiếu.`,
    },
    green: {
      box: "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
      icon: <CheckCircle2Icon className="size-6 shrink-0 text-emerald-600" />,
      title: "Mọi thứ ổn",
      detail: "Không có nick nào bị hạn chế, không có cảnh báo nào trong 14 ngày qua.",
    },
  };
  const s = styles[health];
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-4", s.box)}>
      {s.icon}
      <div>
        <p className="font-semibold">{s.title}</p>
        <p className="text-sm opacity-90">{s.detail}</p>
      </div>
    </div>
  );
}

export default async function FbConnectPage() {
  const user = await requireFbManager();
  const isAdmin = user.role === "ADMIN";
  const own = isAdmin ? {} : { userId: user.id };
  const since = daysAgo(14);

  const [accounts, tokens, warnings, config, owners] = await Promise.all([
    db.fbAccount.findMany({ where: own, orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } } } }),
    db.extToken.findMany({ where: own, orderBy: { createdAt: "desc" }, include: { account: { select: { displayName: true } }, user: { select: { name: true } } } }),
    db.extLog.findMany({
      where: { type: { in: ["SELECTOR_BROKEN", "CHECKPOINT", "SCAN_FAIL"] }, createdAt: { gte: since }, token: own },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { token: { select: { label: true, account: { select: { displayName: true } } } } },
    }),
    getFbConfig(),
    isAdmin ? db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve(null),
  ]);
  const appUrl = getEnv().APP_URL.replace(/\/$/, "");
  const restrictedCount = accounts.filter((a) => a.status === "RESTRICTED").length;
  const health: Health = accounts.length === 0 ? "empty" : restrictedCount > 0 ? "red" : warnings.length > 0 ? "yellow" : "green";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Kết nối extension</h1>
        <p className="text-muted-foreground">
          Extension Chrome &quot;Data Lead Facebook&quot; đọc comment trên những bài người dùng chủ động theo dõi rồi gửi về đây. Extension được build sẵn cho địa chỉ <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{appUrl}</code>, nhân sự chỉ cần dán mã kết nối vào phần Cài đặt của extension.
        </p>
      </div>

      <HealthBanner health={health} restrictedCount={restrictedCount} warningCount={warnings.length} />

      {warnings.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Cảnh báo từ extension (14 ngày gần đây)</CardTitle>
            <CardDescription>
              Dòng &quot;không đọc được trang&quot; hoặc &quot;báo cáo chẩn đoán&quot;: gửi nội dung cột Chi tiết cho người phát triển để chỉnh bộ đọc. Dòng &quot;xác minh / hạn chế&quot;: nick đã tự bị ngừng giao việc, quản trị viên xem lại nick rồi mới bật lại. Dòng &quot;trang đăng nhập&quot;: nhân sự cần đăng nhập lại Facebook trên Chrome của họ.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lúc</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Nick / máy</TableHead>
                  <TableHead>Chi tiết</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warnings.map((w) => {
                  const t = warnText(w.type, w.detail);
                  return (
                    <TableRow key={w.id}>
                      <TableCell className="whitespace-nowrap">{fmtDateTime(w.createdAt)}</TableCell>
                      <TableCell>{t.label}</TableCell>
                      <TableCell>
                        {w.token.account.displayName} · {w.token.label}
                      </TableCell>
                      <TableCell className="max-w-md break-all text-xs text-muted-foreground" title={t.detail}>
                        {t.detail}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nick Facebook ({accounts.length})</CardTitle>
          <CardDescription>
            Nick Facebook dùng để mở và quét các bài đã theo dõi. Nick phải xem được bài và comment. {isAdmin ? "" : "Bạn chỉ thấy nick của mình."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {accounts.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên hiển thị</TableHead>
                  <TableHead>Trang cá nhân</TableHead>
                  <TableHead>Nhân sự</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.displayName}</TableCell>
                    <TableCell className="max-w-56 truncate">
                      <a href={a.profileUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4">
                        {a.profileUrl.replace("https://www.facebook.com/", "")}
                      </a>
                    </TableCell>
                    <TableCell>{a.user.name}</TableCell>
                    <TableCell>
                      <Badge variant={a.status === "ACTIVE" ? "default" : a.status === "RESTRICTED" ? "destructive" : "secondary"}>{STATUS_LABEL[a.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <AccountActions id={a.id} status={a.status} canReenable={isAdmin} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <AccountForm owners={owners} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mã kết nối</CardTitle>
          <CardDescription>Mỗi máy một mã, gắn với một nick. Mã chỉ hiện đúng một lần lúc tạo, hệ thống chỉ lưu bản băm. Thu hồi là extension dừng ở lần gọi kế tiếp.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <TokenForm accounts={accounts.map((a) => ({ id: a.id, displayName: a.displayName }))} />
          {tokens.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Máy</TableHead>
                  <TableHead>Nick</TableHead>
                  <TableHead>Mã</TableHead>
                  <TableHead>Hoạt động cuối</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.label}</TableCell>
                    <TableCell>{t.account.displayName}</TableCell>
                    <TableCell className="font-mono text-xs">{t.tokenPrefix}…</TableCell>
                    <TableCell title={fmtDateTime(t.lastSeenAt)}>{fmtAgo(t.lastSeenAt)}</TableCell>
                    <TableCell>{t.revokedAt ? <Badge variant="secondary">Đã thu hồi</Badge> : <Badge>Đang dùng</Badge>}</TableCell>
                    <TableCell className="text-right">{!t.revokedAt && <RevokeButton id={t.id} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Cấu hình</CardTitle>
            <CardDescription>Áp dụng cho mọi extension ở lần hỏi việc kế tiếp.</CardDescription>
          </CardHeader>
          <CardContent>
            <ConfigForm values={config} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
