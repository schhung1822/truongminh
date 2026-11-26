import type { Metadata } from "next";
import { MonitorSmartphoneIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { deviceLabel } from "@/lib/auth/device";
import { currentSessionHash } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/fb/format";
import { roleLabel } from "@/lib/roles";
import { ChangePasswordForm, LogoutOthersButton } from "./account-client";

export const metadata: Metadata = { title: "Tài khoản của tôi" };

/** Trang của chính người đang đăng nhập (mọi vai trò): xem thông tin, tự đổi mật khẩu, xem và đăng xuất các thiết bị. */
export default async function AccountPage() {
  const user = await requireUser();
  const [row, sessions, currentHash] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { lastLoginAt: true, createdAt: true } }),
    db.authSession.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, tokenHash: true, userAgent: true, createdAt: true, expiresAt: true },
    }),
    currentSessionHash(),
  ]);
  const others = sessions.filter((s) => s.tokenHash !== currentHash).length;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Tài khoản của tôi</h1>
        <p className="text-muted-foreground">Thông tin đăng nhập, mật khẩu và các thiết bị đang đăng nhập bằng tài khoản này.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {user.name} <Badge variant="secondary">{roleLabel(user.role)}</Badge>
          </CardTitle>
          <CardDescription>
            {user.email} · đăng nhập gần nhất {fmtDateTime(row?.lastLoginAt)} · tài khoản tạo {fmtDateTime(row?.createdAt)}. Muốn sửa tên hoặc email, hãy báo quản trị viên.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Đổi mật khẩu</CardTitle>
          <CardDescription>Đổi xong, các thiết bị khác đang đăng nhập bằng tài khoản này sẽ bị đăng xuất; thiết bị này thì giữ nguyên.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm email={user.email} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thiết bị đang đăng nhập ({sessions.length})</CardTitle>
          <CardDescription>Thấy thiết bị lạ thì bấm đăng xuất các thiết bị khác, rồi đổi mật khẩu.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <MonitorSmartphoneIcon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{deviceLabel(s.userAgent)}</p>
                  <p className="text-xs text-muted-foreground">
                    Đăng nhập {fmtDateTime(s.createdAt)} · tự hết hạn {fmtDateTime(s.expiresAt)}
                  </p>
                </div>
                {s.tokenHash === currentHash && <Badge>Thiết bị này</Badge>}
              </li>
            ))}
          </ul>
          <LogoutOthersButton disabled={others === 0} />
        </CardContent>
      </Card>
    </div>
  );
}
