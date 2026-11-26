"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { KeyRoundIcon, Loader2Icon, LockIcon, LockOpenIcon, LogOutIcon, PencilIcon } from "lucide-react";
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
import { NativeSelect } from "@/components/ui/native-select";
import { PasswordInput } from "@/components/ui/password-input";
import type { Role } from "@/generated/prisma/enums";
import { logoutUserEverywhereAction, resetPasswordAction, setUserActiveAction, updateUserAction, type FormState } from "./actions";

type RowUser = { id: string; name: string; email: string; role: Role; isActive: boolean };

/** Sửa tên, email, vai trò. Vai trò của chính mình thì không đổi được (luôn còn ít nhất một quản trị viên). */
function EditUserDialog({ user, isSelf }: { user: RowUser; isSelf: boolean }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(user.role);
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateUserAction.bind(null, user.id), {});

  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- đóng hộp thoại sau khi lưu xong
      setOpen(false);
    }
  }, [state]);

  const toAdmin = role === "ADMIN" && user.role !== "ADMIN";
  const fromAdmin = role !== "ADMIN" && user.role === "ADMIN";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <PencilIcon />
        Sửa
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa tài khoản {user.name}</DialogTitle>
          <DialogDescription>Đổi email thì người này đăng nhập bằng email mới; mật khẩu và các thiết bị đang đăng nhập giữ nguyên.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`name-${user.id}`}>Tên</Label>
            <Input id={`name-${user.id}`} name="name" defaultValue={user.name} required maxLength={100} className="h-10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`email-${user.id}`}>Email đăng nhập</Label>
            <Input id={`email-${user.id}`} name="email" type="email" defaultValue={user.email} required className="h-10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`role-${user.id}`}>Vai trò</Label>
            {/* ô bị khóa không gửi giá trị lên, nên kèm ô ẩn giữ vai trò hiện tại cho trường hợp tự sửa mình */}
            {isSelf && <input type="hidden" name="role" value={user.role} />}
            <NativeSelect id={`role-${user.id}`} name={isSelf ? undefined : "role"} value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="SALE">Sale</option>
              <option value="MKT">Marketing</option>
              <option value="ADMIN">Quản trị viên</option>
            </NativeSelect>
            {isSelf && <p className="text-xs text-muted-foreground">Bạn không tự đổi được vai trò của mình. Nhờ một quản trị viên khác nếu cần.</p>}
          </div>
          {toAdmin && (
            <p className="rounded-lg border border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
              {user.name} sẽ có toàn quyền: xem giá vốn, sửa mọi cấu hình và kết nối, tạo và khóa tài khoản của người khác (kể cả của bạn).
            </p>
          )}
          {fromAdmin && (
            <p className="rounded-lg border border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">{user.name} sẽ mất quyền quản trị ngay khi lưu.</p>
          )}
          <Button type="submit" className="h-10" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Lưu
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user }: { user: RowUser }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(resetPasswordAction.bind(null, user.id), {});

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
        Đặt lại mật khẩu
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đặt lại mật khẩu cho {user.name}</DialogTitle>
          <DialogDescription>
            Đây là mật khẩu tạm để bạn báo cho {user.name}. Người này bị đăng xuất khỏi mọi thiết bị và phải tự đặt mật khẩu riêng ngay khi đăng nhập lại.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`pw-${user.id}`}>Mật khẩu tạm (từ 8 ký tự)</Label>
            <PasswordInput id={`pw-${user.id}`} name="password" autoComplete="new-password" required minLength={8} />
          </div>
          <Button type="submit" className="h-10" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Lưu mật khẩu tạm
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UserRowActions({ user, isSelf, devices }: { user: RowUser; isSelf: boolean; devices: number }) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"active" | "logout" | null>(null);

  function run(what: "active" | "logout", fn: () => Promise<FormState>) {
    setBusy(what);
    startTransition(async () => {
      const result = await fn();
      if (result.error) toast.error(result.error);
      else if (result.ok) toast.success(result.ok);
      setBusy(null);
    });
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <EditUserDialog user={user} isSelf={isSelf} />
      {/* Của chính mình: đổi mật khẩu và quản lý thiết bị ở trang Tài khoản của tôi */}
      {!isSelf && <ResetPasswordDialog user={user} />}
      {!isSelf && devices > 0 && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          title="Đăng xuất người này khỏi mọi thiết bị (mật khẩu giữ nguyên)"
          onClick={() => {
            if (!window.confirm(`Đăng xuất ${user.name} khỏi ${devices} thiết bị đang đăng nhập? Người này vẫn đăng nhập lại được bằng mật khẩu cũ.`)) return;
            run("logout", () => logoutUserEverywhereAction(user.id));
          }}
        >
          {busy === "logout" ? <Loader2Icon className="animate-spin" /> : <LogOutIcon />}
          Đăng xuất thiết bị
        </Button>
      )}
      {!isSelf && (
        <Button
          variant={user.isActive ? "destructive" : "outline"}
          size="sm"
          disabled={pending}
          onClick={() => {
            if (user.isActive && user.role === "ADMIN" && !window.confirm(`Khóa quản trị viên ${user.name}? Người này sẽ bị đăng xuất ngay và không vào được nữa.`)) return;
            run("active", () => setUserActiveAction(user.id, !user.isActive));
          }}
        >
          {busy === "active" ? <Loader2Icon className="animate-spin" /> : user.isActive ? <LockIcon /> : <LockOpenIcon />}
          {user.isActive ? "Khóa" : "Mở khóa"}
        </Button>
      )}
    </div>
  );
}
