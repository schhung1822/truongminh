"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { CopyIcon, Loader2Icon, PauseIcon, PlayIcon, PlusIcon, ShieldOffIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  createAccountAction,
  createTokenAction,
  revokeTokenAction,
  saveFbConfigAction,
  setAccountStatusAction,
  type FbFormState,
} from "./actions";

function useToastOnOk(state: FbFormState, onOk?: () => void) {
  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      onOk?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ phản ứng khi kết quả mới về
  }, [state]);
}

export function AccountForm({ owners }: { owners: { id: string; name: string }[] | null }) {
  const [state, action, pending] = useActionState<FbFormState, FormData>(createAccountAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useToastOnOk(state, () => formRef.current?.reset());

  return (
    <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-3">
      {state.error && (
        <Alert variant="destructive" className="sm:col-span-3">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="acc-name">Tên hiển thị trên Facebook</Label>
        <Input id="acc-name" name="displayName" required maxLength={150} className="h-10" placeholder="Lan Trường Minh" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="acc-url">Link trang cá nhân</Label>
        <Input id="acc-url" name="profileUrl" required maxLength={300} className="h-10" placeholder="https://www.facebook.com/lan.truongminh" />
      </div>
      {owners && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="acc-owner">Nhân sự sở hữu nick</Label>
          <NativeSelect id="acc-owner" name="ownerId" defaultValue="">
            <option value="">Chính tôi</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className="sm:col-span-3">
        <Button type="submit" className="h-10 px-4" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Thêm nick
        </Button>
      </div>
    </form>
  );
}

export function AccountActions({ id, status, canReenable }: { id: string; status: "ACTIVE" | "PAUSED" | "RESTRICTED"; canReenable: boolean }) {
  const [pending, startTransition] = useTransition();
  const run = (next: "ACTIVE" | "PAUSED") =>
    startTransition(async () => {
      const r = await setAccountStatusAction(id, next);
      if (r.error) toast.error(r.error);
      else if (r.ok) toast.success(r.ok);
    });

  if (status === "RESTRICTED" && !canReenable) return <span className="text-xs text-muted-foreground">Chờ quản trị viên bật lại</span>;
  if (status === "ACTIVE") {
    return (
      <Button variant="outline" size="sm" onClick={() => run("PAUSED")} disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : <PauseIcon />}
        Tạm dừng
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={() => run("ACTIVE")} disabled={pending}>
      {pending ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
      {status === "RESTRICTED" ? "Bật lại nick" : "Bật lại"}
    </Button>
  );
}

/**
 * Ô tạo mã kết nối cho một máy mới của MỘT nick (nằm ngay trong thẻ của nick đó). Mã gốc chỉ hiện đúng một lần ở đây.
 */
export function MachineTokenForm({ accountId }: { accountId: string }) {
  const [state, action, pending] = useActionState<FbFormState, FormData>(createTokenAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useToastOnOk(state, () => formRef.current?.reset());

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      toast.success("Đã sao chép mã.");
    } catch {
      toast.error("Không sao chép tự động được, hãy bôi đen mã và sao chép tay.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {state.token && (
        <Alert>
          <AlertTitle>Mã kết nối (chỉ hiện một lần)</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <code className="break-all rounded bg-muted px-2 py-1.5 text-sm select-all">{state.token}</code>
            <div>
              <Button type="button" size="sm" variant="outline" onClick={() => copy(state.token!)}>
                <CopyIcon />
                Sao chép mã
              </Button>
            </div>
            <span>Dán mã này vào trang Cài đặt của extension trên máy đó. Rời trang này là không xem lại được; lỡ mất thì thu hồi và tạo mã mới.</span>
          </AlertDescription>
        </Alert>
      )}
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <form ref={formRef} action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="accountId" value={accountId} />
        <div className="flex min-w-56 flex-1 flex-col gap-1.5 sm:max-w-sm">
          <Label htmlFor={`tok-label-${accountId}`}>Thêm máy: tên máy</Label>
          <Input id={`tok-label-${accountId}`} name="label" required maxLength={100} className="h-10" placeholder="Máy Lan, Chrome chính" />
        </div>
        <Button type="submit" variant="outline" className="h-10 px-4" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          Tạo mã kết nối
        </Button>
      </form>
    </div>
  );
}

export function RevokeButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Thu hồi mã này? Extension đang dùng mã sẽ ngừng hoạt động ngay.")) return;
        startTransition(async () => {
          const r = await revokeTokenAction(id);
          if (r.error) toast.error(r.error);
          else if (r.ok) toast.success(r.ok);
        });
      }}
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <ShieldOffIcon />}
      Thu hồi
    </Button>
  );
}

export type ConfigValues = {
  pollMinutes: number;
  maxPostsPerCycle: number;
  delaySecondsBetweenPosts: number;
  freshHours: number;
  oldIntervalMinutes: number;
  doneAfterDays: number;
  retentionDays: number;
};

const CONFIG_FIELDS: { name: keyof ConfigValues; label: string; hint: string }[] = [
  { name: "pollMinutes", label: "Chu kỳ hỏi việc (phút)", hint: "Extension hỏi web mỗi bấy nhiêu phút; cũng là chu kỳ quét lại bài mới đăng." },
  { name: "maxPostsPerCycle", label: "Số bài tối đa mỗi chu kỳ", hint: "Quét tuần tự từng bài một." },
  { name: "delaySecondsBetweenPosts", label: "Chờ giữa hai bài (giây)", hint: "Số cố định, để không tạo tải bất thường lên tài khoản." },
  { name: "freshHours", label: "Bài mới đăng trong (giờ)", hint: "Bài trong mốc này được quét dày." },
  { name: "oldIntervalMinutes", label: "Chu kỳ quét bài cũ (phút)", hint: "Bài quá mốc trên được quét lại sau bấy nhiêu phút." },
  { name: "doneAfterDays", label: "Tự kết thúc theo dõi sau (ngày)", hint: "Bài không có comment mới sau bấy nhiêu ngày thì chuyển Đã xong." },
  { name: "retentionDays", label: "Xoá comment Khác/Spam sau (ngày)", hint: "0 = không tự xoá. Đề xuất 90." },
];

export function ConfigForm({ values }: { values: ConfigValues }) {
  const [state, action, pending] = useActionState<FbFormState, FormData>(saveFbConfigAction, {});
  useToastOnOk(state);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {state.error && (
        <Alert variant="destructive" className="sm:col-span-2">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {CONFIG_FIELDS.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <Label htmlFor={`cfg-${f.name}`}>{f.label}</Label>
          <Input id={`cfg-${f.name}`} name={f.name} type="number" required defaultValue={values[f.name]} className="h-10" />
          <p className="text-xs text-muted-foreground">{f.hint}</p>
        </div>
      ))}
      <div className="sm:col-span-2">
        <Button type="submit" className="h-10 px-4" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Lưu cấu hình
        </Button>
      </div>
    </form>
  );
}
