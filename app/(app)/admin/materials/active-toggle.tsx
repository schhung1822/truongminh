"use client";

import { useTransition } from "react";
import { Loader2Icon, PowerIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setMaterialActiveAction } from "./actions";

export function ActiveToggle({ id, isActive, sheets }: { id: string; isActive: boolean; /** tên các trang mẫu đang chứa chất liệu này */ sheets: string[] }) {
  const [pending, startTransition] = useTransition();

  function run() {
    if (isActive && sheets.length > 0) {
      const ok = window.confirm(
        `Chất liệu này đang có trong ${sheets.length} trang mẫu: ${sheets.join(", ")}.\nTắt sẽ làm các trang đó thiếu ô này khi tạo ảnh mới. Tiếp tục tắt?`,
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const r = await setMaterialActiveAction(id, !isActive);
      if (r.error) toast.error(r.error);
      else if (r.ok) toast.success(r.ok);
    });
  }

  return (
    <Button variant={isActive ? "ghost" : "secondary"} size="sm" disabled={pending} onClick={run}>
      {pending ? <Loader2Icon className="animate-spin" /> : <PowerIcon />}
      {isActive ? "Tắt" : "Bật"}
    </Button>
  );
}
