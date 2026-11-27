"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { disconnectPinterestAction, setBoardTechniqueHintAction, setBoardZaloFeedAction, syncPinterestAction, type PinterestActionResult } from "./actions";

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

/**
 * Công tắc "gửi pin mới vào nhóm Zalo" của một board. Bật mất vài giây vì máy chủ tải đủ pin hiện có của board trước
 * (để chỉ pin lưu sau lúc bật mới bị coi là mới); không tải được thì công tắc tự trả về tắt.
 */
export function BoardZaloFeedSwitch({ boardId, boardName, checked }: { boardId: string; boardName: string; checked: boolean }) {
  const [on, setOn] = useState(checked);
  const [pending, startTransition] = useTransition();

  function change(value: boolean) {
    setOn(value);
    startTransition(async () => {
      const r = await setBoardZaloFeedAction(boardId, value);
      if (r.error) setOn(!value);
      toastResult(r);
    });
  }

  return (
    <label className="mt-2 flex items-center gap-2 text-xs">
      <Switch checked={on} onCheckedChange={change} disabled={pending} aria-label={`Gửi pin mới của board ${boardName} vào nhóm Zalo`} />
      <span className={on ? "font-medium" : "text-muted-foreground"}>{pending && on ? "Đang tải pin hiện có..." : "Gửi pin mới vào Zalo"}</span>
    </label>
  );
}

/** Chọn công nghệ board này đại diện (ví dụ board "Khắc" → công nghệ "khac-laser"), để picker ảnh phong cách tự gợi ý đúng board. */
export function BoardTechniqueSelect({ boardId, value, options }: { boardId: string; value: string; options: { value: string; label: string }[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <NativeSelect
      className="h-8 text-xs"
      defaultValue={value}
      disabled={pending}
      aria-label="Công nghệ board này đại diện"
      onChange={(e) => startTransition(async () => toastResult(await setBoardTechniqueHintAction(boardId, e.target.value)))}
    >
      <option value="">Không liên kết công nghệ</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          Gợi ý khi chọn: {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}
