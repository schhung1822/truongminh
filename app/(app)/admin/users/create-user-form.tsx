"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createUserAction, type FormState } from "./actions";

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createUserAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-4 sm:grid-cols-3">
      {state.error && (
        <Alert variant="destructive" className="sm:col-span-3">
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
        <Label htmlFor="new-password">Mật khẩu (từ 8 ký tự)</Label>
        <Input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          className="h-10"
        />
      </div>
      <div className="sm:col-span-3">
        <Button type="submit" className="h-10 px-4" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Tạo tài khoản sale
        </Button>
      </div>
    </form>
  );
}
