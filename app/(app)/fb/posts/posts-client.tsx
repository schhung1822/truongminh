"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { CheckIcon, Loader2Icon, PauseIcon, PlayIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { addPostAction, setPurposeAction, setTrackingAction, type PostFormState } from "./actions";

export function AddPostForm({ accounts }: { accounts: { id: string; displayName: string }[] }) {
  const [state, action, pending] = useActionState<PostFormState, FormData>(addPostAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      formRef.current?.reset();
    }
  }, [state]);

  if (accounts.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có nick Facebook nào. Hãy thêm nick ở Hệ thống &gt; Kết nối &gt; Extension Facebook trước.</p>;
  }

  return (
    <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-2">
      {state.error && (
        <Alert variant="destructive" className="sm:col-span-2">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="post-url">Link bài đăng (permalink)</Label>
        <Input id="post-url" name="url" required maxLength={600} className="h-10" placeholder="https://www.facebook.com/groups/.../posts/..." />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-acc">Nick dùng để quét bài</Label>
        <NativeSelect id="post-acc" name="accountId" required defaultValue={accounts[0].id}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.displayName}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-purpose">Mục đích bài</Label>
        <NativeSelect id="post-purpose" name="purpose" required defaultValue="FIND_CUSTOMER">
          <option value="FIND_CUSTOMER">Tìm khách</option>
          <option value="FIND_SUPPLIER">Tìm bên sản xuất</option>
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="post-date">Ngày đăng (không bắt buộc)</Label>
        <Input id="post-date" name="postedDate" type="date" className="h-10" />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="post-content">Nội dung bài (không bắt buộc, để đối chiếu sau này)</Label>
        <Textarea id="post-content" name="content" rows={3} maxLength={20000} />
      </div>
      <p className="text-sm text-muted-foreground sm:col-span-2">
        Bài có thể do người khác đăng. Nick đã chọn cần có quyền xem bài và comment; extension chỉ quét những nội dung đang hiển thị cho nick đó.
      </p>
      <div className="sm:col-span-2">
        <Button type="submit" className="h-10 px-4" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Thêm bài theo dõi
        </Button>
      </div>
    </form>
  );
}

export function PurposeSelect({ id, purpose }: { id: string; purpose: "FIND_CUSTOMER" | "FIND_SUPPLIER" }) {
  const [pending, startTransition] = useTransition();
  return (
    <NativeSelect
      value={purpose}
      disabled={pending}
      className="h-8 w-40 text-xs"
      aria-label="Mục đích bài"
      onChange={(e) =>
        startTransition(async () => {
          const r = await setPurposeAction(id, e.target.value as "FIND_CUSTOMER" | "FIND_SUPPLIER");
          if (r.error) toast.error(r.error);
          else if (r.ok) toast.success(r.ok);
        })
      }
    >
      <option value="FIND_CUSTOMER">Tìm khách</option>
      <option value="FIND_SUPPLIER">Tìm bên sản xuất</option>
    </NativeSelect>
  );
}

export function TrackingActions({ id, status }: { id: string; status: "TRACKING" | "PAUSED" | "DONE" }) {
  const [pending, startTransition] = useTransition();
  const run = (next: "TRACKING" | "PAUSED" | "DONE") =>
    startTransition(async () => {
      const r = await setTrackingAction(id, next);
      if (r.error) toast.error(r.error);
      else if (r.ok) toast.success(r.ok);
    });

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {status === "TRACKING" ? (
        <Button variant="outline" size="sm" onClick={() => run("PAUSED")} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <PauseIcon />}
          Tạm dừng
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => run("TRACKING")} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
          Theo dõi lại
        </Button>
      )}
      {status !== "DONE" && (
        <Button variant="outline" size="sm" onClick={() => run("DONE")} disabled={pending}>
          <CheckIcon />
          Kết thúc
        </Button>
      )}
    </div>
  );
}
