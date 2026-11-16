"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { KeyRoundIcon, Loader2Icon, LockIcon, LockOpenIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction, setUserActiveAction, type FormState } from "./actions";

function ResetPasswordDialog({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    resetPasswordAction.bind(null, userId),
    {},
  );

  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- đóng hộp thoại sau khi đổi mật khẩu xong
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <KeyRoundIcon />
        Đổi mật khẩu
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đổi mật khẩu cho {userName}</DialogTitle>
          <DialogDescription>Người này sẽ bị đăng xuất và cần đăng nhập lại bằng mật khẩu mới.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`pw-${userId}`}>Mật khẩu mới (từ 8 ký tự)</Label>
            <Input
              id={`pw-${userId}`}
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
              className="h-10"
            />
          </div>
          <Button type="submit" className="h-10" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Lưu mật khẩu mới
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UserRowActions({
  userId,
  userName,
  isActive,
  isSelf,
}: {
  userId: string;
  userName: string;
  isActive: boolean;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await setUserActiveAction(userId, !isActive);
      if (result.error) toast.error(result.error);
      else if (result.ok) toast.success(result.ok);
    });
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <ResetPasswordDialog userId={userId} userName={userName} />
      {!isSelf && (
        <Button variant={isActive ? "destructive" : "outline"} size="sm" onClick={toggle} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : isActive ? <LockIcon /> : <LockOpenIcon />}
          {isActive ? "Khóa" : "Mở khóa"}
        </Button>
      )}
    </div>
  );
}
