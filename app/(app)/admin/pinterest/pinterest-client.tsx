"use client";

import { useTransition } from "react";
import { Loader2Icon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { disconnectPinterestAction, syncPinterestAction, type PinterestActionResult } from "./actions";

function toastResult(r: PinterestActionResult) {
  if (r.error) toast.error(r.error);
  else if (r.ok) toast.success(r.ok);
}

export function SyncButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button type="button" variant="outline" disabled={pending} onClick={() => startTransition(async () => toastResult(await syncPinterestAction()))}>
      {pending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
      Đồng bộ ngay
    </Button>
  );
}

export function DisconnectButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Ngắt kết nối tài khoản Pinterest này? Sẽ xóa danh sách board/pin đã đồng bộ (ảnh đã tạo trước đó không bị ảnh hưởng).")) return;
        startTransition(async () => toastResult(await disconnectPinterestAction()));
      }}
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
      Ngắt kết nối
    </Button>
  );
}
