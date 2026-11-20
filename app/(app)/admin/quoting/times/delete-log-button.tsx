"use client";

import { useState, useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteTimeLogAction } from "../actions";
import { ConfirmDialog } from "../confirm-dialog";

/** Nút xóa một bản ghi thời gian máy, có hộp xác nhận. */
export function DeleteLogButton({ id, description }: { id: string; description: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const r = await deleteTimeLogAction(id);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(r.ok ?? "Đã xóa.");
      setOpen(false);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => setOpen(true)} aria-label={`Xóa bản ghi: ${description}`}>
        <Trash2Icon /> Xóa
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Xóa bản ghi thời gian máy?"
        description={`"${description}" sẽ không còn được dùng khi hiệu chỉnh. Việc này không hoàn tác được.`}
        confirmLabel="Xóa hẳn"
        cancelLabel="Giữ lại"
        destructive
        pending={pending}
        onConfirm={run}
      />
    </>
  );
}
