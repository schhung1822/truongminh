import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { roleLabel } from "@/lib/roles";
import { CreateUserForm } from "./create-user-form";
import { UserRowActions } from "./user-row-actions";

export const metadata: Metadata = { title: "Người dùng" };

export default async function UsersPage() {
  const admin = await requireAdmin();
  const users = await db.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Người dùng</h1>
        <p className="text-muted-foreground">Tạo tài khoản cho sale và marketing, đổi vai trò, khóa tài khoản hoặc đổi mật khẩu.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thêm tài khoản</CardTitle>
          <CardDescription>Web không có trang tự đăng ký, chỉ quản trị viên tạo được tài khoản.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateUserForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{roleLabel(u.role)}</TableCell>
                  <TableCell>
                    {u.isActive ? <Badge>Đang hoạt động</Badge> : <Badge variant="secondary">Đã khóa</Badge>}
                  </TableCell>
                  <TableCell>
                    <UserRowActions
                      userId={u.id}
                      userName={u.name}
                      isActive={u.isActive}
                      isSelf={u.id === admin.id}
                      role={u.role}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
