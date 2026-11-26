import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUser } from "@/lib/auth/dal";
// Nhập ảnh trực tiếp như trang đăng nhập (xem ghi chú ở app/(auth)/login/page.tsx).
import logo from "@/public/images/logo_truongminh.png";
import { FirstPasswordForm } from "./first-password-form";

export const metadata: Metadata = { title: "Đặt mật khẩu mới" };
export const instant = false;

/**
 * Trang bắt buộc với tài khoản còn dùng mật khẩu tạm do quản trị viên đặt (tạo tài khoản mới hoặc đặt lại mật khẩu):
 * lib/auth/dal.ts đưa mọi trang khác về đây cho tới khi người dùng tự đặt mật khẩu riêng. Nằm ngoài khung menu (app)
 * vì khung đó cũng đòi đã đổi mật khẩu. Đọc cookie nên phần nội dung phải nằm trong Suspense.
 */
async function Gate() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/account");
  return (
    <Card className="w-full max-w-sm shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Đặt mật khẩu mới</CardTitle>
        <CardDescription>
          Chào {user.name}. Mật khẩu bạn vừa dùng là mật khẩu tạm do quản trị viên cấp. Hãy đặt mật khẩu riêng, chỉ mình bạn biết, rồi mới dùng tiếp.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FirstPasswordForm email={user.email} />
      </CardContent>
    </Card>
  );
}

export default function ChangePasswordPage() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="flex items-center justify-center bg-neutral-950 px-6 py-4">
        <img src={logo.src} width={logo.width} height={logo.height} alt="Trường Minh" className="h-12 w-auto" />
      </div>
      <section className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-10">
        <Suspense fallback={<Skeleton className="h-80 w-full max-w-sm" />}>
          <Gate />
        </Suspense>
      </section>
    </main>
  );
}
