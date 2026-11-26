"use client";

import { useTransition } from "react";
import { Loader2Icon, StarIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setSheetDefaultAction } from "./actions";

/** Đặt hoặc bỏ "trang mẫu mặc định": trang được tick sẵn khi sale bấm "Chọn bộ chất liệu" (D126). */
export function SheetDefaultToggle({ id, isDefault, disabled }: { id: string; isDefault: boolean; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={isDefault ? "secondary" : "ghost"}
      size="sm"
      disabled={pending || disabled}
      title={isDefault ? "Bỏ khỏi trang mẫu mặc định" : "Dùng làm trang mẫu mặc định (tick sẵn khi sale bấm Chọn bộ chất liệu)"}
      onClick={() =>
        startTransition(async () => {
          const r = await setSheetDefaultAction(id, !isDefault);
          if (r.error) toast.error(r.error);
          else if (r.ok) toast.success(r.ok);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <StarIcon className={isDefault ? "fill-amber-400 text-amber-500" : ""} />}
      {isDefault ? "Mặc định" : "Đặt mặc định"}
    </Button>
  );
}
