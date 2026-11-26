"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Loader2Icon, LogOutIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { changePasswordAction, logoutOtherDevicesAction, type AccountState } from "./actions";

export function ChangePasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<AccountState, FormData>(changePasswordAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex max-w-sm flex-col gap-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {/* Ô email ẩn để trình quản lý mật khẩu cập nhật đúng tài khoản */}
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="acc-current">Mật khẩu hiện tại</Label>
        <PasswordInput id="acc-current" name="current" autoComplete="current-password" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="acc-new">Mật khẩu mới (từ 8 ký tự)</Label>
        <PasswordInput id="acc-new" name="password" autoComplete="new-password" required minLength={8} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="acc-confirm">Nhập lại mật khẩu mới</Label>
        <PasswordInput id="acc-confirm" name="confirm" autoComplete="new-password" required minLength={8} />
      </div>
      <Button type="submit" className="h-10 self-start px-5" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Đổi mật khẩu
      </Button>
    </form>
  );
}

export function LogoutOthersButton({ disabled }: { disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="self-start"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const r = await logoutOtherDevicesAction();
          if (r.error) toast.error(r.error);
          else if (r.ok) toast.success(r.ok);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <LogOutIcon />}
      Đăng xuất các thiết bị khác
    </Button>
  );
}
