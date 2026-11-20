"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Result = { error?: string; ok?: string };

/** Nút xóa có hộp xác nhận. `action` là Server Action đã gắn sẵn tham số (ví dụ deleteArticleAction.bind(null, id)). */
export function ConfirmDeleteButton({
  action,
  title,
  description,
  label = "Xóa",
  onDone,
}: {
  action: () => Promise<Result>;
  title: string;
  description: string;
  label?: string;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const r = await action();
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(r.ok ?? "Đã xóa.");
      setOpen(false);
      onDone?.();
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="text-destructive">
        <Trash2Icon /> {label}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Giữ lại
            </Button>
            <Button type="button" variant="destructive" onClick={run} disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Xóa hẳn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
