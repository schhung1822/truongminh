"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Loader2Icon, PauseIcon, PlayIcon, PlusIcon, StarIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  createPageAction,
  createTemplateAction,
  deletePageAction,
  deleteTemplateAction,
  renamePageAction,
  saveReplyConfigAction,
  seedTemplatesAction,
  setDefaultPageAction,
  setPageStatusAction,
  setTemplateActiveAction,
  updateTemplateAction,
  type FormState,
} from "./actions";

function toastResult(r: FormState) {
  if (r.error) toast.error(r.error);
  else if (r.ok) toast.success(r.ok);
}

function useToastOnOk(state: FormState, onOk?: () => void) {
  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      onOk?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ phản ứng khi kết quả mới về
  }, [state]);
}

export function PageForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createPageAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useToastOnOk(state, () => formRef.current?.reset());
  return (
    <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      {state.error && (
        <Alert variant="destructive" className="sm:col-span-3">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="page-name">Tên fanpage (đúng như trên Facebook)</Label>
        <Input id="page-name" name="name" required maxLength={150} className="h-10" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="page-url">Link fanpage</Label>
        <Input id="page-url" name="url" required maxLength={300} className="h-10" placeholder="https://www.facebook.com/..." />
      </div>
      <Button type="submit" variant="outline" className="h-10 px-4" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
        Thêm fanpage
      </Button>
    </form>
  );
}

export function PageActions({ page, canDelete }: { page: { id: string; name: string; isDefault: boolean; status: "ACTIVE" | "PAUSED" }; canDelete: boolean }) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<FormState>) => startTransition(async () => toastResult(await fn()));
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {!page.isDefault && page.status === "ACTIVE" && (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => setDefaultPageAction(page.id))}>
          <StarIcon />
          Đặt mặc định
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          const name = window.prompt("Tên fanpage đúng như hiện trên Facebook:", page.name);
          if (name && name.trim() && name.trim() !== page.name) run(() => renamePageAction(page.id, name));
        }}
      >
        Đổi tên
      </Button>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => setPageStatusAction(page.id, page.status === "ACTIVE" ? "PAUSED" : "ACTIVE"))}>
        {page.status === "ACTIVE" ? <PauseIcon /> : <PlayIcon />}
        {page.status === "ACTIVE" ? "Tạm dừng" : "Bật lại"}
      </Button>
      {canDelete && (
        <Button
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Gỡ fanpage ${page.name}? Các câu chưa gửi đang đứng tên fanpage này sẽ bị bỏ qua.`)) run(() => deletePageAction(page.id));
          }}
        >
          <Trash2Icon />
          Gỡ
        </Button>
      )}
    </div>
  );
}

export type ReplyConfigValues = { supplierAiEnabled: boolean; offerCooldownDays: number; fallbackWhenPageUnavailable: "account" | "skip"; replyInterestEnabled: boolean };

export function ReplyConfigForm({ values, canEdit }: { values: ReplyConfigValues; canEdit: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveReplyConfigAction, {});
  useToastOnOk(state);
  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2">
      {state.error && (
        <Alert variant="destructive" className="sm:col-span-2">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <label className="flex items-start gap-3 sm:col-span-2">
        <input type="checkbox" name="supplierAiEnabled" defaultChecked={values.supplierAiEnabled} disabled={!canEdit} className="mt-1 size-4" />
        <span>
          <span className="font-medium">AI phân loại và soạn câu cho bài tìm nhà sản xuất</span>
          <span className="block text-sm text-muted-foreground">
            AI đọc comment (đã che số điện thoại và email), xếp là xưởng trực tiếp hay môi giới, tóm tắt năng lực, soạn câu mời nhắc đúng vật liệu gợi ý của bài, và nhận ra xưởng trong comment không để lại số. Tắt, hoặc khi AI lỗi: dùng mẫu câu, loại để &quot;chưa rõ&quot;. Mỗi comment tốn một lượt gọi AI (kie.ai).
          </span>
        </span>
      </label>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cfg-cooldown">Không chào lại trong (ngày)</Label>
        <Input id="cfg-cooldown" name="offerCooldownDays" type="number" min={0} max={365} required defaultValue={values.offerCooldownDays} disabled={!canEdit} className="h-10" />
        <p className="text-xs text-muted-foreground">Một nhà sản xuất (theo số điện thoại) đã được chào thì comment ở bài khác trong thời gian này vẫn ghi vào lead nhưng không soạn câu chào mới. 0 = không chặn.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cfg-fallback">Khi nhóm chưa có fanpage tham gia</Label>
        <NativeSelect id="cfg-fallback" name="fallbackWhenPageUnavailable" defaultValue={values.fallbackWhenPageUnavailable} disabled={!canEdit}>
          <option value="account">Soạn câu trả lời bằng nick đã quét bài</option>
          <option value="skip">Không soạn câu (vẫn tạo lead)</option>
        </NativeSelect>
        <p className="text-xs text-muted-foreground">Cũng áp dụng khi extension báo không trả lời được dưới tên fanpage ở một nhóm.</p>
      </div>
      <label className="flex items-start gap-3 sm:col-span-2">
        <input type="checkbox" name="replyInterestEnabled" defaultChecked={values.replyInterestEnabled} disabled={!canEdit} className="mt-1 size-4" />
        <span>
          <span className="font-medium">Bài tìm khách: soạn câu dẫn về inbox fanpage</span>
          <span className="block text-sm text-muted-foreground">Comment &quot;ib&quot;, &quot;quan tâm&quot;, &quot;xin giá&quot; hoặc câu hỏi trên bài tìm khách được soạn sẵn một câu từ mẫu, đứng tên nick đã quét bài. Mặc định tắt.</span>
        </span>
      </label>
      {canEdit && (
        <div className="sm:col-span-2">
          <Button type="submit" className="h-10 px-4" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Lưu cấu hình
          </Button>
        </div>
      )}
    </form>
  );
}

export function TemplateForm({ kinds }: { kinds: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTemplateAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useToastOnOk(state, () => formRef.current?.reset());
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5 sm:max-w-md">
        <Label htmlFor="tpl-kind">Loại câu</Label>
        <NativeSelect id="tpl-kind" name="kind" defaultValue={kinds[0]?.value}>
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tpl-text">Nội dung (1-2 câu)</Label>
        <Textarea id="tpl-text" name="text" rows={3} required maxLength={1000} placeholder="Dạ chào {ten}, bên em là {ten_page} chuyên cung cấp vật liệu..." />
      </div>
      <div>
        <Button type="submit" variant="outline" className="h-10 px-4" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          Thêm mẫu
        </Button>
      </div>
    </form>
  );
}

export function TemplateItem({ template }: { template: { id: string; text: string; active: boolean } }) {
  const [text, setText] = useState(template.text);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<FormState>) => startTransition(async () => toastResult(await fn()));
  const dirty = text.trim() !== template.text.trim();
  return (
    <li className={`flex flex-col gap-2 rounded-lg border p-3 ${template.active ? "" : "opacity-60"}`}>
      <Textarea value={text} rows={3} maxLength={1000} aria-label="Nội dung mẫu câu" onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || !dirty} onClick={() => run(() => updateTemplateAction(template.id, text))}>
          {pending && <Loader2Icon className="animate-spin" />}
          Lưu
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setTemplateActiveAction(template.id, !template.active))}>
          {template.active ? "Tắt mẫu này" : "Bật mẫu này"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Xóa mẫu câu này?")) run(() => deleteTemplateAction(template.id));
          }}
        >
          <Trash2Icon />
          Xóa
        </Button>
        {!template.active && <span className="text-xs text-muted-foreground">Đang tắt</span>}
      </div>
    </li>
  );
}

export function SeedTemplatesButton({ kind }: { kind: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => toastResult(await seedTemplatesAction(kind)))}>
        {pending && <Loader2Icon className="animate-spin" />}
        Nạp mẫu có sẵn để sửa
      </Button>
    </div>
  );
}
