"use client";

import { useState, useTransition } from "react";
import { TagIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { replacePinStyleTagsAction } from "./actions";

export type StyleTagOption = { value: string; label: string };

/** Nút (chỉ admin thấy) mở hộp thoại gắn/bỏ tag phong cách cho một pin — dùng chung danh mục STYLE_TAG với Chất liệu. */
export function PinStyleTagEditor({
  pinId,
  label,
  options,
  selected,
}: {
  pinId: string;
  label: string;
  options: StyleTagOption[];
  selected: string[];
}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set(selected));
  const [pending, startTransition] = useTransition();

  function toggle(value: string) {
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const r = await replacePinStyleTagsAction(pinId, [...checked]);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`Đã cập nhật tag phong cách cho ${label}.`);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="icon" className="size-8" title="Gắn tag phong cách" aria-label={`Gắn tag phong cách cho ${label}`} />}
      >
        <TagIcon />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tag phong cách — {label}</DialogTitle>
          <DialogDescription>Dùng chung danh sách phong cách với Chất liệu, để sale lọc nhanh đúng gu khách.</DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có phong cách nào đang bật. Thêm ở Quản trị &gt; Chất liệu &gt; Danh mục chất liệu.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm has-checked:border-primary has-checked:bg-primary/10"
              >
                <input type="checkbox" className="size-3.5" checked={checked.has(o.value)} onChange={() => toggle(o.value)} />
                {o.label}
              </label>
            ))}
          </div>
        )}
        <Button type="button" onClick={save} disabled={pending} className="self-end">
          {pending ? "Đang lưu..." : "Lưu"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
