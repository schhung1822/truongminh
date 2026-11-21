import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getFbConfig } from "@/lib/ext/config";
import { requireFbManager } from "@/lib/fb/access";
import { fmtAgo, fmtDateTime } from "@/lib/fb/format";
import { AccountActions, AccountForm, ConfigForm, RevokeButton, TokenForm } from "./connect-client";

export const metadata: Metadata = { title: "Kết nối extension" };

const STATUS_LABEL = { ACTIVE: "Đang hoạt động", PAUSED: "Tạm dừng", RESTRICTED: "Bị hạn chế" } as const;
const WARN_LABEL = { SELECTOR_BROKEN: "Không tìm thấy phần tử trên trang Facebook", CHECKPOINT: "Facebook yêu cầu xác minh / hạn chế nick" } as const;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 3600_000);
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
      where: { type: { in: ["SELECTOR_BROKEN", "CHECKPOINT"] }, createdAt: { gte: since }, token: own },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { token: { select: { label: true, account: { select: { displayName: true } } } } },
    }),
    getFbConfig(),
    isAdmin ? db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve(null),
  ]);
  const appUrl = getEnv().APP_URL.replace(/\/$/, "");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Kết nối extension</h1>
        <p className="text-muted-foreground">
          Extension Chrome chỉ đọc comment trên bài do nick của mình đăng rồi gửi về đây. Địa chỉ web nhập vào extension: <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{appUrl}</code>
        </p>
      </div>

      {warnings.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Cảnh báo từ extension (14 ngày gần đây)</CardTitle>
            <CardDescription>
              Báo &quot;không tìm thấy phần tử&quot; nghĩa là Facebook đã đổi giao diện, cần sửa selector. Báo xác minh / hạn chế thì nick đã tự bị ngừng giao việc, quản trị viên xem lại nick rồi mới bật lại.
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
                {warnings.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="whitespace-nowrap">{fmtDateTime(w.createdAt)}</TableCell>
                    <TableCell>{WARN_LABEL[w.type as keyof typeof WARN_LABEL] ?? w.type}</TableCell>
                    <TableCell>
                      {w.token.account.displayName} · {w.token.label}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{w.detail ? JSON.stringify(w.detail) : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nick Facebook ({accounts.length})</CardTitle>
          <CardDescription>
            Nick dùng để đăng bài. Extension chỉ đọc bài của đúng nick này. {isAdmin ? "" : "Bạn chỉ thấy nick của mình."}
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
