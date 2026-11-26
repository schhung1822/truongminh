import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AlertTriangleIcon, CheckCircle2Icon, CircleHelpIcon, ExternalLinkIcon, MonitorIcon, TriangleAlertIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getFbConfig } from "@/lib/ext/config";
import { requireFbManager } from "@/lib/fb/access";
import { fmtAgo, fmtDateTime } from "@/lib/fb/format";
import { StatusPill, type Tone } from "../status";
import { AccountActions, AccountForm, ConfigForm, MachineTokenForm, RevokeButton } from "./extension-client";

export const metadata: Metadata = { title: "Kết nối: extension Facebook" };

const STATUS: Record<"ACTIVE" | "PAUSED" | "RESTRICTED", { label: string; tone: Tone }> = {
  ACTIVE: { label: "Đang hoạt động", tone: "ok" },
  PAUSED: { label: "Tạm dừng", tone: "off" },
  RESTRICTED: { label: "Bị hạn chế", tone: "error" },
};
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

function minutesAgo(minutes: number): number {
  return Date.now() - minutes * 60_000;
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
      detail: "Thêm nick Facebook ở ô \"Thêm nick Facebook\" dưới đây, rồi tạo mã kết nối cho từng máy sẽ chạy extension bằng nick đó.",
    },
    red: {
      box: "border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200",
      icon: <AlertTriangleIcon className="size-6 shrink-0 text-red-600" />,
      title: "Cần xử lý ngay",
      detail: `${restrictedCount} nick đang bị Facebook hạn chế, không quét được. Xem nick có nhãn "Bị hạn chế" dưới đây để kiểm tra lại.`,
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

export default async function ExtensionConnectionPage() {
  const user = await requireFbManager();
  const isAdmin = user.role === "ADMIN";
  const own = isAdmin ? {} : { userId: user.id };
  const since = daysAgo(14);

  const [accounts, tokens, warnings, config, owners] = await Promise.all([
    db.fbAccount.findMany({ where: own, orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } } } }),
    db.extToken.findMany({ where: own, orderBy: { createdAt: "asc" } }),
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

  // Máy "đang chạy" = extension vừa hỏi việc trong khoảng hai chu kỳ gần đây (tối thiểu 10 phút để không nhấp nháy).
  const onlineSince = minutesAgo(Math.max(10, config.pollMinutes * 2));
  const tokensByAccount = new Map<string, typeof tokens>();
  for (const t of tokens) tokensByAccount.set(t.accountId, [...(tokensByAccount.get(t.accountId) ?? []), t]);
  const liveMachines = tokens.filter((t) => !t.revokedAt).length;

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Extension Chrome &quot;Data Lead Facebook&quot; đọc comment trên những bài người dùng chủ động theo dõi rồi gửi về đây. Mỗi nick Facebook có thể chạy trên nhiều máy, mỗi máy dùng một mã kết nối riêng. Extension được
        build sẵn cho địa chỉ <code className="rounded bg-muted px-1.5 py-0.5">{appUrl}</code>, nhân sự chỉ cần dán mã vào phần Cài đặt của extension.
      </p>

      <HealthBanner health={health} restrictedCount={restrictedCount} warningCount={warnings.length} />

      <section className="flex flex-col gap-3" aria-labelledby="ext-accounts">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ext-accounts" className="text-lg font-semibold">
            Nick Facebook và máy đã kết nối
          </h2>
          <p className="text-sm text-muted-foreground">
            {accounts.length} nick · {liveMachines} máy đang có mã{isAdmin ? "" : " · bạn chỉ thấy nick của mình"}
          </p>
        </div>

        {accounts.map((a) => {
          const all = tokensByAccount.get(a.id) ?? [];
          const live = all.filter((t) => !t.revokedAt);
          const revoked = all.filter((t) => t.revokedAt);
          const st = STATUS[a.status];
          return (
            <Card key={a.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-muted text-base font-semibold uppercase" aria-hidden>
                    {a.displayName.trim().charAt(0) || "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      {a.displayName}
                      <StatusPill tone={st.tone}>{st.label}</StatusPill>
                    </CardTitle>
                    <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <a href={a.profileUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 underline underline-offset-4">
                        {a.profileUrl.replace("https://www.facebook.com/", "facebook.com/")} <ExternalLinkIcon className="size-3.5" />
                      </a>
                      <span>Nhân sự: {a.user.name}</span>
                    </CardDescription>
                  </div>
                  <AccountActions id={a.id} status={a.status} canReenable={isAdmin} />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm font-medium">Máy chạy extension bằng nick này ({live.length})</p>
                {live.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Chưa có máy nào. Đặt tên máy ở ô dưới rồi tạo mã kết nối.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {live.map((t) => {
                      const online = !!t.lastSeenAt && t.lastSeenAt.getTime() >= onlineSince;
                      return (
                        <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                          <MonitorIcon className="size-5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{t.label}</p>
                            <p className="text-xs text-muted-foreground">
                              Mã <span className="font-mono">{t.tokenPrefix}…</span> · tạo {fmtDateTime(t.createdAt)}
                            </p>
                          </div>
                          <span title={t.lastSeenAt ? `Hoạt động cuối: ${fmtDateTime(t.lastSeenAt)}` : undefined}>
                            <StatusPill tone={online ? "ok" : "off"}>{online ? "Đang chạy" : t.lastSeenAt ? `Hoạt động ${fmtAgo(t.lastSeenAt)}` : "Chưa dùng lần nào"}</StatusPill>
                          </span>
                          <RevokeButton id={t.id} />
                        </li>
                      );
                    })}
                  </ul>
                )}
                <MachineTokenForm accountId={a.id} />
                {revoked.length > 0 && (
                  <details className="text-sm text-muted-foreground">
                    <summary className="cursor-pointer">{revoked.length} mã đã thu hồi</summary>
                    <ul className="mt-2 flex flex-col gap-1 pl-4">
                      {revoked.map((t) => (
                        <li key={t.id}>
                          {t.label} · <span className="font-mono">{t.tokenPrefix}…</span> · thu hồi {fmtDateTime(t.revokedAt)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </CardContent>
            </Card>
          );
        })}

        <Card className="border-dashed ring-0">
          <CardHeader>
            <CardTitle>Thêm nick Facebook</CardTitle>
            <CardDescription>Nick dùng để mở và quét các bài đã theo dõi, phải xem được bài và comment. Thêm bao nhiêu nick cũng được; thêm xong thì tạo mã cho từng máy ở thẻ của nick đó.</CardDescription>
          </CardHeader>
          <CardContent>
            <AccountForm owners={owners} />
          </CardContent>
        </Card>
      </section>

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

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Cấu hình quét</CardTitle>
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
