"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { sendToZaloAction } from "../actions";

export type ZaloGroupOption = { id: string; name: string };

/**
 * Nút "Gửi lên nhóm Zalo" kèm hộp xác nhận chọn nhóm (ảnh đã gửi vào nhóm thì không rút lại được).
 * Có imageId = gửi một ảnh; không có = gửi tất cả ảnh đã xong của phiên.
 */
export function ZaloSendButton({
  sessionId,
  imageId,
  groups,
  count,
  label,
}: {
  sessionId: string;
  imageId?: string;
  groups: ZaloGroupOption[];
  /** số ảnh sẽ gửi, chỉ để hiện trong hộp xác nhận */
  count: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  if (groups.length === 0) return null;

  function send() {
    startTransition(async () => {
      const r = await sendToZaloAction({ sessionId, groupId, imageId });
      if (r.error) return void toast.error(r.error);
      toast.success(r.ok ?? "Đã gửi.");
      setOpen(false);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setOpen(true)}>
        <SendIcon /> {label}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gửi lên nhóm Zalo</DialogTitle>
            <DialogDescription>
              {imageId ? "Gửi ảnh này" : `Gửi ${count} ảnh đã xong của phiên này`} vào nhóm bên dưới. Tin đã gửi không thu hồi được. Ảnh nào đã
              gửi vào nhóm này rồi sẽ được bỏ qua.
            </DialogDescription>
          </DialogHeader>
          <NativeSelect value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Nhóm Zalo">
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Hủy
            </Button>
            <Button type="button" onClick={send} disabled={pending || !groupId}>
              {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Gửi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
