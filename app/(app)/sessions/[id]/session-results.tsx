"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileTextIcon,
  Loader2Icon,
  PaletteIcon,
  RefreshCwIcon,
  ZoomInIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { estimateProgress, formatElapsed, overallProgress } from "@/lib/jobs/progress";
import { isFinished, type ImageView } from "@/lib/jobs/view";
import { cn } from "@/lib/utils";
import { refinishSessionAction, retryImageAction } from "../actions";

const POLL_MS = 3000;
const TICK_MS = 500;

/** Thanh tiến trình. `tone` đổi màu theo trạng thái. */
function ProgressBar({
  percent,
  tone = "primary",
  label,
  className,
}: {
  percent: number;
  tone?: "primary" | "success" | "error";
  label: string;
  className?: string;
}) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="progressbar"
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          tone === "primary" && "bg-primary",
          tone === "success" && "bg-emerald-500",
          tone === "error" && "bg-red-500",
        )}
        style={{ width: `${p}%` }}
      />
    </div>
  );
}

export function SessionResults({
  sessionId,
  initialImages,
  canRefinish,
  designHref,
  isDesign,
}: {
  sessionId: string;
  initialImages: ImageView[];
  /** người tạo phiên hoặc admin: được vẽ lại khung và nhãn */
  canRefinish: boolean;
  /** đường dẫn sang Bước 2 (thiết kế theo chất liệu khách chọn) */
  designHref?: string;
  /** đang xem một lượt thiết kế (bước 2) */
  isDesign: boolean;
}) {
  const [images, setImages] = useState(initialImages);
  const [zoom, setZoom] = useState<ImageView | null>(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  const [receivedAt, setReceivedAt] = useState(() => performance.now());
  const inFlight = useRef(false);
  const router = useRouter();

  const open = images.some((i) => !isFinished(i.status));
  const done = images.filter((i) => i.status === "SUCCESS").length;
  const failed = images.filter((i) => i.status === "FAILED").length;

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
      // mốc nhận dữ liệu: cộng thời gian trôi qua kể từ lúc này (không phụ thuộc đồng hồ máy)
      setReceivedAt(performance.now());
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      inFlight.current = false;
    }
  }, [sessionId, router]);

  const [refinishing, startRefinish] = useTransition();

  function refinish() {
    startRefinish(async () => {
      const r = await refinishSessionAction(sessionId);
      if (r.error) return void toast.error(r.error);
      toast.success(`Đã vẽ lại ${r.count} ảnh.`);
      await refresh();
    });
  }

  // Hỏi lại server mỗi vài giây khi còn ảnh chưa xong; xong hết thì dừng.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [open, refresh]);

  // Làm thanh tiến trình chạy mượt giữa hai lần hỏi server
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(performance.now()), TICK_MS);
    return () => clearInterval(t);
  }, [open]);

  const sinceReceived = open ? Math.max(0, now - receivedAt) : 0;
  const percents = images.map((i) => estimateProgress(i.status, i.ageMs + sinceReceived, i.expectedMs));
  const overall = open ? Math.min(99, overallProgress(percents)) : 100;
  const longest = images.reduce((m, i) => (isFinished(i.status) ? m : Math.max(m, i.ageMs)), 0) + sinceReceived;

  // Khi vừa xong hết: báo thanh đầu trang cập nhật token, hiện thông báo, đổi tiêu đề tab
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) {
      window.dispatchEvent(new Event("usage:refresh"));
      if (failed === 0) toast.success(`Hoàn thành: đã tạo xong ${done} ảnh.`);
      else toast.warning(`Đã xong ${done} ảnh, ${failed} ảnh bị lỗi.`);
    }
    wasOpen.current = open;
  }, [open, done, failed]);

  useEffect(() => {
    const original = document.title;
    if (open) document.title = `(${overall}%) Đang tạo ảnh... | Ảnh mẫu in logo`;
    return () => {
      document.title = original;
    };
  }, [open, overall]);

  return (
    <div className="flex flex-col gap-4">
      {/* Tiến độ chung */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          {open ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-medium">
                  <Loader2Icon className="size-4 animate-spin" />
                  Đang tạo ảnh: xong {done}/{images.length}
                  {failed > 0 && <span className="text-red-600"> · {failed} lỗi</span>}
                </p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  Ước tính {overall}% · đã chờ {formatElapsed(longest)}
                </p>
              </div>
              <ProgressBar percent={overall} label="Tiến độ tạo ảnh" />
              <p className="text-xs text-muted-foreground">
                Thanh tiến độ là ước tính theo thời gian chờ (kie.ai không báo phần trăm thật). Bạn có thể để trang này mở,
                trang tự cập nhật khi xong.
              </p>
            </>
          ) : (
            <>
              <p className={cn("flex items-center gap-2 font-medium", failed > 0 ? "text-amber-700" : "text-emerald-700")}>
                {failed > 0 ? <AlertTriangleIcon className="size-5" /> : <CheckCircle2Icon className="size-5" />}
                {failed > 0 ? `Hoàn tất: ${done} ảnh xong, ${failed} ảnh lỗi (bấm Tạo lại ở ảnh lỗi)` : `Hoàn thành: đã tạo xong ${done}/${images.length} ảnh`}
              </p>
              <ProgressBar percent={100} tone={failed > 0 ? "error" : "success"} label="Đã hoàn thành" />
              {done > 0 && designHref && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <Link href={designHref} className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}>
                    <PaletteIcon /> {isDesign ? "Thiết kế thêm theo chất liệu khác" : "Bước 2: Thiết kế theo chất liệu khách chọn"}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {isDesign
                      ? "Chọn thêm chất liệu hoặc loại sản phẩm khác từ phiên catalog."
                      : "Khách đã chọn được chất liệu ưng ý? Tạo ảnh thiết kế sản phẩm trên chất liệu đó."}
                  </span>
                </div>
              )}
              {done > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a href={`/api/sessions/${sessionId}/download?format=zip`} className={cn(buttonVariants({ size: "sm" }), "h-9")}>
                    <DownloadIcon /> Tải tất cả (ZIP)
                  </a>
                  <a
                    href={`/api/sessions/${sessionId}/download?format=pdf`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9")}
                  >
                    <FileTextIcon /> Tải PDF
                  </a>
                  {canRefinish && (
                    <Button type="button" variant="outline" size="sm" className="h-9" onClick={refinish} disabled={refinishing}>
                      {refinishing ? <Loader2Icon className="animate-spin" /> : <PaletteIcon />}
                      Vẽ lại khung và nhãn
                    </Button>
                  )}
                </div>
              )}
              {canRefinish && done > 0 && (
                <p className="text-xs text-muted-foreground">
                  &quot;Vẽ lại khung và nhãn&quot; áp dụng lại tên xưởng, nhãn chất liệu... theo cấu hình mới nhất. Không gọi AI nên không tốn token.
                  Ảnh luôn được lưu lại, xem lại ở mục Lịch sử.
                </p>
              )}
            </>
          )}
          {offline && <Badge variant="secondary">Mất kết nối, đang thử lại</Badge>}
        </CardContent>
      </Card>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {images.map((img, i) => (
          <li key={img.id}>
            <ImageCard
              img={img}
              percent={percents[i]}
              elapsedMs={img.ageMs + sinceReceived}
              onZoom={() => setZoom(img)}
              onRetried={refresh}
            />
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

function stageText(img: ImageView): string {
  if (img.status === "PENDING") return img.attempt > 1 ? `Đang gửi lại (lần ${img.attempt})...` : "Đang chuẩn bị và gửi ảnh tham chiếu...";
  return img.attempt > 1 ? `AI đang tạo ảnh (thử lại lần ${img.attempt})...` : "AI đang tạo ảnh...";
}

function ImageCard({
  img,
  percent,
  elapsedMs,
  onZoom,
  onRetried,
}: {
  img: ImageView;
  percent: number;
  elapsedMs: number;
  onZoom: () => void;
  onRetried: () => void;
}) {
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
          <div className="flex aspect-2/3 flex-col items-center justify-center gap-3 rounded-lg border bg-muted/50 p-4 text-center">
            <Loader2Icon className="size-7 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{stageText(img)}</p>
            <ProgressBar percent={percent} label={`Tiến độ: ${img.label}`} className="max-w-48" />
            <p className="text-xs tabular-nums text-muted-foreground">
              Khoảng {Math.round(percent)}% · {formatElapsed(elapsedMs)}
            </p>
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
