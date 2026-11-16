"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ImageOffIcon,
  Loader2Icon,
  LockIcon,
  PencilIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ActiveToggle } from "./active-toggle";
import { deleteMaterialsAction } from "./actions";

export type BoardItem = {
  id: string;
  code: string;
  name: string;
  groupName: string;
  printTech: string;
  descHuman: string;
  descAi: string;
  isActive: boolean;
  refUrl: string | null;
  /** tên các trang mẫu đang chứa chất liệu này */
  sheets: string[];
  /** đã từng dùng để tạo ảnh: không xóa được, chỉ tắt */
  used: boolean;
};

export function MaterialsBoard({ items, view }: { items: BoardItem[]; view: "grid" | "list" }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState<BoardItem | null>(null);
  const [confirm, setConfirm] = useState<BoardItem[] | null>(null);
  const [pending, startTransition] = useTransition();

  const deletable = items.filter((i) => !i.used);
  const selectedItems = items.filter((i) => selected.has(i.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runDelete(list: BoardItem[]) {
    startTransition(async () => {
      const r = await deleteMaterialsAction(list.map((i) => i.id));
      setConfirm(null);
      if (r.error) return void toast.error(r.error);
      if (r.deleted) toast.success(`Đã xóa ${r.deleted} chất liệu.`);
      if (r.skipped?.length) {
        toast.warning(`Giữ lại ${r.skipped.length} chất liệu: ${r.skipped.map((s) => `${s.code} (${s.reason})`).join("; ")}`);
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  const actions = (m: BoardItem) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link href={`/admin/materials/${m.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <PencilIcon /> Sửa
      </Link>
      <ActiveToggle id={m.id} isActive={m.isActive} />
      {m.used ? (
        <span
          title="Đã từng dùng để tạo ảnh nên không xóa được. Hãy bấm Tắt để ẩn khỏi danh sách chọn."
          className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground"
        >
          <LockIcon className="size-3.5" /> Đã dùng
        </span>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setConfirm([m])}
          aria-label={`Xóa ${m.code}`}
        >
          <Trash2Icon /> Xóa
        </Button>
      )}
    </div>
  );

  const warnings = (m: BoardItem) => (
    <>
      {!m.refUrl && (
        <Badge variant="secondary" className="bg-amber-100 text-amber-800">
          Thiếu ảnh
        </Badge>
      )}
      {!m.descAi && (
        <Badge variant="secondary" className="bg-amber-100 text-amber-800">
          Thiếu mô tả AI
        </Badge>
      )}
    </>
  );

  const usage = (m: BoardItem) =>
    m.sheets.length > 0
      ? `Trong ${m.sheets.length} trang mẫu: ${m.sheets.join(", ")}`
      : m.used
        ? "Đã từng dùng để tạo ảnh"
        : "Chưa nằm trong trang mẫu nào";

  return (
    <div className="flex flex-col gap-4">
      {view === "grid" ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((m) => (
            <li
              key={m.id}
              className={cn(
                "group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md",
                selected.has(m.id) && "ring-2 ring-primary",
                !m.isActive && "opacity-75",
              )}
            >
              <div className="relative aspect-11/5 border-b bg-white">
                <button
                  type="button"
                  onClick={() => setZoom(m)}
                  className="flex size-full items-center justify-center p-1.5"
                  aria-label={`Xem lớn ${m.code}`}
                >
                  {m.refUrl ? (
                    <img src={m.refUrl} alt={m.name} className="max-h-full max-w-full object-contain" loading="lazy" />
                  ) : (
                    <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                      <ImageOffIcon className="size-7" />
                      Chưa có ảnh
                    </span>
                  )}
                </button>
                <div className="absolute top-2 left-2 rounded bg-white/90 p-1 shadow-sm">
                  <Checkbox
                    checked={selected.has(m.id)}
                    onCheckedChange={() => toggle(m.id)}
                    aria-label={`Chọn ${m.code}`}
                    className="size-5"
                  />
                </div>
                <span
                  className={cn(
                    "absolute top-2 right-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shadow-sm",
                    m.isActive ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-700",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", m.isActive ? "bg-emerald-500" : "bg-zinc-500")} />
                  {m.isActive ? "Đang bật" : "Đã tắt"}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">{m.code}</p>
                  <p className="truncate text-base leading-tight font-semibold" title={m.name}>
                    {m.name}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">{m.groupName}</Badge>
                  <Badge variant="outline">{m.printTech}</Badge>
                  {warnings(m)}
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground" title={usage(m)}>
                  {usage(m)}
                </p>
                <div className="mt-auto pt-1">{actions(m)}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
          {items.map((m) => (
            <li
              key={m.id}
              className={cn(
                "flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap",
                selected.has(m.id) && "bg-primary/5",
                !m.isActive && "opacity-75",
              )}
            >
              <Checkbox
                checked={selected.has(m.id)}
                onCheckedChange={() => toggle(m.id)}
                aria-label={`Chọn ${m.code}`}
                className="size-5"
              />
              <button
                type="button"
                onClick={() => setZoom(m)}
                className="flex h-14 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white"
                aria-label={`Xem lớn ${m.code}`}
              >
                {m.refUrl ? (
                  <img src={m.refUrl} alt={m.name} className="max-h-full max-w-full object-contain" loading="lazy" />
                ) : (
                  <ImageOffIcon className="size-5 text-muted-foreground" />
                )}
              </button>
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-semibold">
                  <span className="mr-2 font-mono text-xs font-normal text-muted-foreground">{m.code}</span>
                  {m.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{m.groupName}</Badge>
                  <Badge variant="outline">{m.printTech}</Badge>
                  {warnings(m)}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{usage(m)}</p>
              </div>
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  m.isActive ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-700",
                )}
              >
                <span className={cn("size-1.5 rounded-full", m.isActive ? "bg-emerald-500" : "bg-zinc-500")} />
                {m.isActive ? "Đang bật" : "Đã tắt"}
              </span>
              <div className="shrink-0">{actions(m)}</div>
            </li>
          ))}
        </ul>
      )}

      {/* Thanh thao tác khi đã chọn */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3 shadow-lg">
          <span className="text-sm font-medium">Đã chọn {selected.size} chất liệu</span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-9"
            onClick={() => setConfirm(selectedItems)}
            disabled={pending}
          >
            <Trash2Icon /> Xóa đã chọn
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setSelected(new Set(items.map((i) => i.id)))}>
            Chọn cả trang ({items.length})
          </Button>
          {deletable.length > 0 && deletable.length < items.length && (
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setSelected(new Set(deletable.map((i) => i.id)))}>
              Chỉ chọn cái xóa được ({deletable.length})
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" className="ml-auto h-9" onClick={() => setSelected(new Set())}>
            <XIcon /> Bỏ chọn
          </Button>
        </div>
      )}

      {/* Xác nhận xóa */}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && !pending && setConfirm(null)}>
        <DialogContent>
          {confirm && <ConfirmBody items={confirm} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(null)} disabled={pending}>
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => confirm && runDelete(confirm)}
              disabled={pending || !confirm || confirm.every((i) => i.used)}
            >
              {pending && <Loader2Icon className="animate-spin" />}
              Xóa vĩnh viễn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Xem lớn */}
      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          {zoom && (
            <>
              <DialogHeader>
                <DialogTitle>
                  <span className="mr-2 font-mono text-sm font-normal text-muted-foreground">{zoom.code}</span>
                  {zoom.name}
                </DialogTitle>
                <DialogDescription>
                  {zoom.groupName} · {zoom.printTech}
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-center rounded-lg border bg-white p-2">
                {zoom.refUrl ? (
                  <img src={zoom.refUrl} alt={zoom.name} className="max-h-[50vh] w-auto max-w-full object-contain" />
                ) : (
                  <span className="p-8 text-sm text-muted-foreground">Chưa có ảnh tham chiếu</span>
                )}
              </div>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Mô tả cho người đọc</dt>
                  <dd>{zoom.descHuman || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Mô tả cho AI</dt>
                  <dd>{zoom.descAi || "—"}</dd>
                </div>
              </dl>
              <Link href={`/admin/materials/${zoom.id}`} className={buttonVariants({ className: "h-10 self-start" })}>
                <PencilIcon /> Sửa chất liệu này
              </Link>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConfirmBody({ items }: { items: BoardItem[] }) {
  const removable = items.filter((i) => !i.used);
  const kept = items.filter((i) => i.used);
  const inSheets = removable.filter((i) => i.sheets.length > 0);
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {removable.length === 1 ? `Xóa chất liệu ${removable[0].code}?` : `Xóa ${removable.length} chất liệu?`}
        </DialogTitle>
        <DialogDescription>
          Xóa vĩnh viễn, kèm toàn bộ ảnh của chất liệu. Không thể hoàn tác.
        </DialogDescription>
      </DialogHeader>
      {removable.length > 0 && (
        <p className="rounded-lg bg-muted p-2 text-sm">
          {removable
            .slice(0, 8)
            .map((i) => `${i.code} - ${i.name}`)
            .join(" · ")}
          {removable.length > 8 && ` và ${removable.length - 8} chất liệu khác`}
        </p>
      )}
      {inSheets.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          {inSheets.length} chất liệu đang nằm trong trang mẫu và sẽ bị gỡ khỏi các trang đó.
        </p>
      )}
      {kept.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border p-2 text-sm text-muted-foreground">
          <LockIcon className="mt-0.5 size-4 shrink-0" />
          {kept.length} chất liệu đã từng dùng để tạo ảnh ({kept.map((i) => i.code).join(", ")}) sẽ được giữ lại. Hãy
          dùng nút Tắt cho các chất liệu này.
        </p>
      )}
    </>
  );
}
