"use client";

import { useState } from "react";
import { CheckIcon, ClipboardCopyIcon, CopyIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type CopyImage = { id: string; label: string; url: string };

/**
 * Nguồn ảnh để copy: luôn đi qua máy chủ của mình (cùng địa chỉ trang web). Ảnh trên R2 nằm ở tên miền khác,
 * nên vẽ lên canvas để đổi sang PNG sẽ bị trình duyệt chặn nếu bucket chưa bật CORS. Đường này còn trả JPEG chuẩn.
 */
export const copySourceUrl = (imageId: string) => `/api/images/${imageId}/download`;

/** Ảnh của hệ thống -> PNG (clipboard của trình duyệt chỉ nhận PNG). */
async function toPngBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được ảnh (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Không đổi được ảnh sang PNG."))), "image/png"));
}

/** Đưa MỘT ảnh vào clipboard. Truyền Promise vào ClipboardItem để vẫn tính là thao tác của người dùng (Safari yêu cầu). */
export async function copyImageToClipboard(url: string): Promise<void> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("Trình duyệt hoặc địa chỉ này không cho copy ảnh (cần mở bằng https hoặc localhost). Dùng nút tải ZIP thay thế.");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": toPngBlob(url) })]);
}

/** Nút copy MỘT ảnh, chỉ có biểu tượng (cho gọn): bấm là ảnh vào clipboard, dán vào Zalo bằng Ctrl+V. */
export function CopyImageIconButton({ url, label }: { url: string; label: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  async function copy() {
    if (state === "busy") return;
    setState("busy");
    try {
      await copyImageToClipboard(url);
      toast.success(`Đã copy ${label}. Dán vào Zalo bằng Ctrl+V.`);
      setState("done");
      setTimeout(() => setState("idle"), 2000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không copy được ảnh.");
      setState("idle");
    }
  }

  return (
    <Button type="button" variant="outline" size="icon" className="size-8" onClick={copy} disabled={state === "busy"} title="Copy ảnh để dán Zalo" aria-label={`Copy ${label}`}>
      {state === "busy" ? <Loader2Icon className="animate-spin" /> : state === "done" ? <CheckIcon className="text-emerald-600" /> : <CopyIcon />}
    </Button>
  );
}

/**
 * Nút "Copy ảnh để dán Zalo". Trình duyệt chỉ cho đưa MỘT ảnh vào clipboard mỗi lần, nên nút mở một bảng chạy lần lượt:
 * bấm "Copy" thì ảnh hiện tại vào clipboard, dán (Ctrl+V) vào ô chat Zalo, rồi tự chuyển sang ảnh kế tiếp.
 */
export function CopyImagesButton({
  images,
  label = "Copy ảnh để dán Zalo",
  size = "sm",
  className,
}: {
  images: CopyImage[];
  label?: string;
  size?: "sm" | "default";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState(0); // ảnh sẽ copy ở lần bấm tiếp theo
  const [copied, setCopied] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  if (images.length === 0) return null;
  const finished = copied.size >= images.length;
  const cur = images[Math.min(next, images.length - 1)]; // danh sách ảnh có thể đổi khi trang tự cập nhật

  async function copy(index: number) {
    const img = images[index];
    if (!img || busy) return;
    setBusy(img.id);
    try {
      await copyImageToClipboard(img.url);
      setCopied((s) => new Set(s).add(img.id));
      const upcoming = index + 1 < images.length ? index + 1 : index;
      setNext(upcoming);
      toast.success(
        index + 1 < images.length
          ? `Đã copy ${img.label}. Dán vào Zalo (Ctrl+V), rồi bấm Copy để lấy ảnh tiếp theo.`
          : `Đã copy ${img.label}, ảnh cuối cùng. Dán vào Zalo là xong.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không copy được ảnh.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className={cn(size === "sm" && "h-9", className)}
        onClick={() => {
          setOpen(true);
          setNext(0);
          setCopied(new Set());
        }}
      >
        <ClipboardCopyIcon /> {label} ({images.length})
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle>Copy ảnh để dán vào Zalo</DialogTitle>
          <DialogDescription>
            Trình duyệt chỉ copy được một ảnh mỗi lần. Bấm <b>Copy</b>, chuyển sang Zalo dán (Ctrl+V), rồi quay lại bấm ảnh kế tiếp.
          </DialogDescription>

          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
            <img src={cur.url} alt={cur.label} className="h-24 w-auto max-w-40 rounded border bg-white object-contain" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{finished ? "Đã copy hết ảnh" : `Ảnh tiếp theo: ${cur.label}`}</p>
              <p className="text-sm text-muted-foreground">
                Đã copy {copied.size}/{images.length} ảnh
              </p>
            </div>
            <Button type="button" className="h-11 px-5" onClick={() => copy(next)} disabled={!!busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : <ClipboardCopyIcon />}
              {copied.has(cur.id) ? "Copy lại" : "Copy"}
            </Button>
          </div>

          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {images.map((img, i) => (
              <li key={img.id}>
                <button
                  type="button"
                  onClick={() => copy(i)}
                  disabled={!!busy}
                  className={cn(
                    "group relative block w-full overflow-hidden rounded-lg border text-left transition-colors hover:border-primary",
                    i === next && "border-primary ring-1 ring-primary",
                  )}
                  aria-label={`Copy ${img.label}`}
                >
                  <img src={img.url} alt="" className="aspect-3/2 w-full bg-white object-cover" loading="lazy" />
                  <span className="flex items-center justify-between gap-1 px-2 py-1 text-xs">
                    <span className="truncate">{img.label}</span>
                    {copied.has(img.id) ? <CheckIcon className="size-4 shrink-0 text-emerald-600" /> : <ClipboardCopyIcon className="size-3.5 shrink-0 opacity-50" />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
