import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/dal";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng nhập" };
export const instant = false;

// Đã đăng nhập mà vào /login thì chuyển về trang chính. Đọc cookie nên phải nằm trong Suspense.
async function RedirectIfSignedIn() {
  if (await getSessionUser()) redirect("/");
  return null;
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-10">
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Ảnh mẫu in logo</CardTitle>
          <CardDescription>Đăng nhập bằng tài khoản do quản trị viên cấp.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
