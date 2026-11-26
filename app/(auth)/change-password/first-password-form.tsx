"use client";

import { useActionState } from "react";
import { Loader2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { logoutAction, setFirstPasswordAction, type FirstPasswordState } from "../actions";

export function FirstPasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<FirstPasswordState, FormData>(setFirstPasswordAction, {});

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {/* Ô email ẩn để trình quản lý mật khẩu lưu đúng tài khoản */}
        <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">Mật khẩu mới (từ 8 ký tự)</Label>
          <PasswordInput id="new-password" name="password" autoComplete="new-password" required minLength={8} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-password">Nhập lại mật khẩu mới</Label>
          <PasswordInput id="confirm-password" name="confirm" autoComplete="new-password" required minLength={8} />
        </div>
        <Button type="submit" size="lg" className="h-10" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Lưu và vào hệ thống
        </Button>
      </form>
      <form action={logoutAction} className="text-center">
        <button type="submit" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Đăng xuất ({email})
        </button>
      </form>
    </div>
  );
}
