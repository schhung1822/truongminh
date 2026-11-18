"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteBrandAction,
  deleteCustomerAction,
  renameBrandAction,
  renameCustomerAction,
} from "@/app/(app)/customers/actions";

type Kind = "customer" | "brand";

/** Hai nút nhỏ (đổi tên, xóa) hiện ở góc ô thư mục. Dùng cho thư mục khách hàng và thương hiệu. */
export function FolderActions({
  kind,
  id,
  name,
  onRenamed,
  onDeleted,
}: {
  kind: Kind;
  id: string;
  name: string;
  onRenamed: (name: string) => void;
  onDeleted: () => void;
}) {
  const [mode, setMode] = useState<"rename" | "delete" | null>(null);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = kind === "customer" ? "khách hàng" : "thương hiệu";

  function open(m: "rename" | "delete") {
    setValue(name);
    setError(null);
    setMode(m);
  }

  function rename() {
    setError(null);
    startTransition(async () => {
      const r = await (kind === "customer" ? renameCustomerAction(id, value) : renameBrandAction(id, value));
      if (r.error || !r.name) return setError(r.error ?? "Không đổi được tên.");
      toast.success("Đã đổi tên thư mục.");
      setMode(null);
      onRenamed(r.name);
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const r = await (kind === "customer" ? deleteCustomerAction(id) : deleteBrandAction(id));
      if (r.error) return setError(r.error);
      toast.success("Đã xóa thư mục.");
      setMode(null);
      onDeleted();
    });
  }

  const btn =
    "flex size-7 items-center justify-center rounded-md border bg-background/90 text-muted-foreground shadow-xs transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

  return (
    <>
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-100 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover/tile:opacity-100">
        <button type="button" className={btn} onClick={() => open("rename")} aria-label={`Đổi tên thư mục ${name}`} title="Đổi tên">
          <PencilIcon className="size-3.5" />
        </button>
        <button
          type="button"
          className={`${btn} hover:border-red-300 hover:text-red-600`}
          onClick={() => open("delete")}
          aria-label={`Xóa thư mục ${name}`}
          title="Xóa"
        >
          <Trash2Icon className="size-3.5" />
        </button>
      </div>

      <Dialog open={mode === "rename"} onOpenChange={(o) => !o && !pending && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đổi tên thư mục {label}</DialogTitle>
            <DialogDescription>Chỉ đổi tên hiển thị, các ảnh đã tạo không bị ảnh hưởng.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              rename();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`rename-${id}`}>Tên {label}</Label>
              <Input
                id={`rename-${id}`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={150}
                className="h-10"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setMode(null)} disabled={pending}>
                Hủy
              </Button>
              <Button type="submit" disabled={pending || !value.trim() || value.trim() === name}>
                {pending && <Loader2Icon className="animate-spin" />}
                Lưu tên mới
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "delete"} onOpenChange={(o) => !o && !pending && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa thư mục &quot;{name}&quot;?</DialogTitle>
            <DialogDescription>
              Chỉ xóa được thư mục chưa tạo ảnh nào.{" "}
              {kind === "customer"
                ? "Các thương hiệu và logo bên trong cũng bị xóa theo."
                : "Các logo bên trong cũng bị xóa theo."}{" "}
              Không hoàn lại được.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setMode(null)} disabled={pending}>
              Hủy
            </Button>
            <Button type="button" variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Xóa thư mục
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
