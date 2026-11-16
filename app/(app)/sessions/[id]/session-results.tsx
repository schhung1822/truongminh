"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangleIcon, DownloadIcon, Loader2Icon, RefreshCwIcon, ZoomInIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { isFinished, type ImageView } from "@/lib/jobs/view";
import { cn } from "@/lib/utils";
import { retryImageAction } from "../actions";

const POLL_MS = 3000;

export function SessionResults({ sessionId, initialImages }: { sessionId: string; initialImages: ImageView[] }) {
  const [images, setImages] = useState(initialImages);
  const [zoom, setZoom] = useState<ImageView | null>(null);
  const [offline, setOffline] = useState(false);
  const inFlight = useRef(false);
  const router = useRouter();

  const open = images.some((i) => !isFinished(i.status));
  const done = images.filter((i) => i.status === "SUCCESS").length;

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/sync`, { method: "POST" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { images: ImageView[] };
      setImages(body.images);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      inFlight.current = false;
    }
  }, [sessionId, router]);

  // Hỏi lại server mỗi vài giây khi còn ảnh chưa xong; xong hết thì dừng.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [open, refresh]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium">
          Đã xong {done}/{images.length} ảnh
        </p>
        {open && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Đang tạo, trang tự cập nhật...
          </span>
        )}
        {offline && <Badge variant="secondary">Mất kết nối, đang thử lại</Badge>}
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((img) => (
          <li key={img.id}>
            <ImageCard img={img} onZoom={() => setZoom(img)} onRetried={refresh} />
          </li>
        ))}
      </ul>

      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogTitle>{zoom?.label}</DialogTitle>
          <DialogDescription className="sr-only">Ảnh phóng to</DialogDescription>
          {zoom?.finalUrl && <img src={zoom.finalUrl} alt={zoom.label} className="w-full rounded-lg border" />}
          {zoom?.downloadUrl && (
            <a href={zoom.downloadUrl} className={buttonVariants({ className: "h-10 self-start" })}>
              <DownloadIcon /> Tải ảnh về
            </a>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ImageCard({ img, onZoom, onRetried }: { img: ImageView; onZoom: () => void; onRetried: () => void }) {
  const [pending, startTransition] = useTransition();

  function retry() {
    startTransition(async () => {
      const r = await retryImageAction(img.id);
      if (r.error) return void toast.error(r.error);
      toast.success("Đã bắt đầu tạo lại.");
      onRetried();
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 font-medium">{img.label}</p>
          <StatusBadge img={img} />
        </div>

        {img.status === "SUCCESS" && img.finalUrl && (
          <button
            type="button"
            onClick={onZoom}
            className="group relative block overflow-hidden rounded-lg border bg-muted"
            aria-label={`Xem lớn: ${img.label}`}
          >
            <img src={img.finalUrl} alt={img.label} className="w-full" loading="lazy" />
            <span className="absolute right-2 bottom-2 rounded-full bg-black/60 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
              <ZoomInIcon className="size-4" />
            </span>
          </button>
        )}

        {(img.status === "PENDING" || img.status === "PROCESSING") && (
          <div className="flex aspect-[2/3] animate-pulse flex-col items-center justify-center gap-2 rounded-lg border bg-muted text-sm text-muted-foreground">
            <Loader2Icon className="size-6 animate-spin" />
            {img.status === "PENDING" ? "Đang chờ gửi..." : "AI đang tạo ảnh..."}
            {img.attempt > 1 && <span className="text-xs">Đang thử lại lần {img.attempt}</span>}
          </div>
        )}

        {img.status === "FAILED" && (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertDescription>
              Không tạo được ảnh này. Bạn bấm &quot;Tạo lại&quot; để thử lần nữa.
              {img.errorDetail && <span className="mt-1 block text-xs opacity-80">Chi tiết (admin): {img.errorDetail}</span>}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          {img.downloadUrl && (
            <a href={img.downloadUrl} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9")}>
              <DownloadIcon /> Tải về
            </a>
          )}
          {img.canRetry && (
            <Button
              type="button"
              variant={img.status === "FAILED" ? "default" : "outline"}
              size="sm"
              className="h-9"
              onClick={retry}
              disabled={pending}
            >
              {pending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              Tạo lại trang này
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ img }: { img: ImageView }) {
  switch (img.status) {
    case "SUCCESS":
      return <Badge>Xong</Badge>;
    case "FAILED":
      return <Badge variant="destructive">Lỗi</Badge>;
    case "PROCESSING":
      return <Badge variant="secondary">Đang tạo</Badge>;
    default:
      return <Badge variant="secondary">Đang chờ</Badge>;
  }
}
