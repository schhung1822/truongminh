"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2Icon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createGroupAction, updateGroupAction, type GroupFormState } from "./actions";

const PURPOSES = [
  { value: "BOTH", label: "Tìm khách và tìm bên sản xuất" },
  { value: "FIND_CUSTOMER", label: "Tìm khách" },
  { value: "FIND_SUPPLIER", label: "Tìm bên sản xuất" },
];

export function GroupForm() {
  const [state, action, pending] = useActionState<GroupFormState, FormData>(createGroupAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-2">
      {state.error && (
        <Alert variant="destructive" className="sm:col-span-2">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="grp-url">Link nhóm</Label>
        <Input id="grp-url" name="url" required maxLength={300} className="h-10" placeholder="https://www.facebook.com/groups/..." />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="grp-name">Tên nhóm (để trống thì lấy từ link)</Label>
        <Input id="grp-name" name="name" maxLength={200} className="h-10" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="grp-topic">Ngành / chủ đề</Label>
        <Input id="grp-topic" name="topic" maxLength={150} className="h-10" placeholder="In ấn, quà tặng, quảng cáo..." />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="grp-purpose">Mục đích</Label>
        <NativeSelect id="grp-purpose" name="purpose" defaultValue="BOTH">
          {PURPOSES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="grp-notes">Quy định của nhóm, lưu ý admin</Label>
        <Textarea id="grp-notes" name="notes" rows={2} maxLength={5000} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" className="h-10 px-4" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          Thêm nhóm
        </Button>
      </div>
    </form>
  );
}

export type GroupEditValues = { id: string; name: string; topic: string; purpose: string; notes: string; status: string };

export function GroupEditDialog({ group }: { group: GroupEditValues }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<GroupFormState, FormData>(updateGroupAction.bind(null, group.id), {});
  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- đóng hộp thoại sau khi lưu xong
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <PencilIcon />
        Sửa
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa nhóm</DialogTitle>
          <DialogDescription>Link nhóm không đổi được; muốn đổi thì thêm nhóm mới.</DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`g-name-${group.id}`}>Tên nhóm</Label>
            <Input id={`g-name-${group.id}`} name="name" required maxLength={200} defaultValue={group.name} className="h-10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`g-topic-${group.id}`}>Ngành / chủ đề</Label>
            <Input id={`g-topic-${group.id}`} name="topic" maxLength={150} defaultValue={group.topic} className="h-10" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`g-purpose-${group.id}`}>Mục đích</Label>
              <NativeSelect id={`g-purpose-${group.id}`} name="purpose" defaultValue={group.purpose}>
                {PURPOSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`g-status-${group.id}`}>Trạng thái</Label>
              <NativeSelect id={`g-status-${group.id}`} name="status" defaultValue={group.status}>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="PAUSED">Tạm dừng</option>
                <option value="BANNED">Bị chặn (không quét)</option>
              </NativeSelect>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`g-notes-${group.id}`}>Quy định của nhóm, lưu ý admin</Label>
            <Textarea id={`g-notes-${group.id}`} name="notes" rows={3} maxLength={5000} defaultValue={group.notes} />
          </div>
          <Button type="submit" className="h-10" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Lưu
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
