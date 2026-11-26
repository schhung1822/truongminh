"use client";

import { useActionState, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { loginAction, type LoginState } from "../actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  // Mặc định ghi nhớ (như trước nay: phiên 30 ngày). Bỏ chọn trên máy dùng chung.
  const [remember, setRemember] = useState(true);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        {/* Nhập sai mật khẩu thì giữ lại email vừa gõ (form tự xóa trắng sau mỗi lần gửi) */}
        <Input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email ?? ""} className="h-10" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Mật khẩu</Label>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </div>
      <div className="flex flex-col gap-1">
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={remember} onCheckedChange={(c) => setRemember(c === true)} />
          Ghi nhớ đăng nhập 30 ngày
        </label>
        <input type="hidden" name="remember" value={remember ? "1" : "0"} />
        {!remember && <p className="pl-6 text-xs text-muted-foreground">Phiên đăng nhập sẽ hết khi đóng trình duyệt, tối đa 1 ngày.</p>}
      </div>
      <Button type="submit" size="lg" className="h-10 bg-[#d21628] text-white shadow-[0_6px_16px_-6px_rgba(210,22,40,0.6)] hover:bg-[#b81222]" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        {pending ? "Đang đăng nhập..." : "Đăng nhập"}
      </Button>
    </form>
  );
}
