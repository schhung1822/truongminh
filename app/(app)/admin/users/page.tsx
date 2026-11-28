import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { fmtAgo, fmtDateTime } from "@/lib/fb/format";
import { roleLabel } from "@/lib/roles";
import { CreateUserForm } from "./create-user-form";
import { UserRowActions } from "./user-row-actions";

export const metadata: Metadata = { title: "Người dùng" };

export default async function UsersPage() {
  const admin = await requireAdmin();
  const [users, sessions] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true, lastLoginAt: true },
    }),
    // số thiết bị = số phiên đăng nhập còn hạn của mỗi người
    db.authSession.groupBy({ by: ["userId"], where: { expiresAt: { gt: new Date() } }, _count: { _all: true } }),
  ]);
  const devices = new Map(sessions.map((s) => [s.userId, s._count._all]));
  const admins = users.filter((u) => u.role === "ADMIN" && u.isActive).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Người dùng</h1>
        <p className="text-muted-foreground">
          Tạo tài khoản, sửa tên, email và vai trò, đặt lại mật khẩu, đăng xuất khỏi thiết bị hoặc khóa tài khoản. Mọi thao tác ở đây được ghi vào{" "}
          <Link href="/admin/activity" className="underline underline-offset-4">
            Nhật ký hoạt động
          </Link>
          . Ai được dùng bot Zalo và mã ghép nối của từng người nằm ở{" "}
          <Link href="/admin/zalo/staff" className="underline underline-offset-4">
            Cài đặt Zalo &gt; Nhân viên và quyền
          </Link>
          .
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thêm tài khoản</CardTitle>
          <CardDescription>
            Web không có trang tự đăng ký, chỉ quản trị viên tạo được tài khoản. Mật khẩu nhập ở đây là mật khẩu tạm: người dùng phải tự đặt mật khẩu riêng ngay lần đăng nhập đầu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateUserForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách ({users.length})</CardTitle>
          <CardDescription>
            Đang có {admins} quản trị viên hoạt động.{admins < 2 && " Nên có ít nhất hai, để khi một người quên mật khẩu thì người kia đặt lại được."}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Người dùng</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Đăng nhập gần nhất</TableHead>
                <TableHead>Thiết bị</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const count = devices.get(u.id) ?? 0;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <p className="font-medium">
                        {u.name}
                        {u.id === admin.id && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(bạn)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </TableCell>
                    <TableCell>{u.role === "ADMIN" ? <Badge variant="outline">{roleLabel(u.role)}</Badge> : roleLabel(u.role)}</TableCell>
                    <TableCell>
                      <span className="flex flex-col items-start gap-1">
                        {u.isActive ? <Badge>Đang hoạt động</Badge> : <Badge variant="secondary">Đã khóa</Badge>}
                        {u.mustChangePassword && u.isActive && <span className="text-xs text-amber-700">Chưa đổi mật khẩu tạm</span>}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap" title={u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : undefined}>
                      {u.lastLoginAt ? fmtAgo(u.lastLoginAt) : <span className="text-muted-foreground">Chưa ghi nhận</span>}
                    </TableCell>
                    <TableCell className="tabular-nums">{count > 0 ? count : <span className="text-muted-foreground">0</span>}</TableCell>
                    <TableCell>
                      <UserRowActions
                        key={`${u.id}:${u.name}:${u.email}:${u.role}`}
                        user={{ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive }}
                        isSelf={u.id === admin.id}
                        devices={count}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
