"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PasswordInput } from "@/components/ui/password-input";
import { createUserAction, type FormState } from "./actions";

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createUserAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState("SALE");

  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      formRef.current?.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- đưa ô vai trò về mặc định sau khi tạo xong
      setRole("SALE");
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-4 sm:grid-cols-4">
      {state.error && (
        <Alert variant="destructive" className="sm:col-span-4">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-name">Tên</Label>
        <Input id="new-name" name="name" required maxLength={100} className="h-10" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-email">Email đăng nhập</Label>
        <Input id="new-email" name="email" type="email" required className="h-10" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">Mật khẩu tạm (từ 8 ký tự)</Label>
        <PasswordInput id="new-password" name="password" autoComplete="new-password" required minLength={8} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-role">Vai trò</Label>
        <NativeSelect id="new-role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="SALE">Sale</option>
          <option value="MKT">Marketing</option>
          <option value="ADMIN">Quản trị viên</option>
        </NativeSelect>
      </div>
      {role === "ADMIN" && (
        <p className="rounded-lg border border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-4">
          Quản trị viên có toàn quyền: xem giá vốn, sửa mọi cấu hình và kết nối, tạo và khóa tài khoản của người khác. Chỉ cấp cho người thật sự cần.
        </p>
      )}
      <div className="sm:col-span-4">
        <Button type="submit" className="h-10 px-4" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Tạo tài khoản
        </Button>
      </div>
    </form>
  );
}
