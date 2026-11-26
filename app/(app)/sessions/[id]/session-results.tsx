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
  XIcon,
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
import { CellSelectImage, type SelectableCell } from "@/components/cell-select-image";
import { CopyImageIconButton, CopyImagesButton, copySourceUrl } from "@/components/copy-images";
import { MAX_DESIGN_MATERIALS } from "@/lib/design/assign";
import type { LabelPos, LabelStyle } from "@/lib/imaging/label-pos";
import { refinishSessionAction, retryImageAction } from "../actions";
import { LabelPositionButton } from "./label-position";

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
  labelMode = "overlay",
  defaultLabelPos = "br",
}: {
  sessionId: string;
  initialImages: ImageView[];
  /** người tạo phiên hoặc admin: được vẽ lại khung và nhãn */
  canRefinish: boolean;
  /** đường dẫn sang Bước 2 (thiết kế theo chất liệu khách chọn) */
  designHref?: string;
  /** đang xem một lượt thiết kế (bước 2) */
  isDesign: boolean;
  /** kiểu nhãn mặc định trong Cấu hình (ảnh chưa chọn riêng) */
  labelMode?: Exclude<LabelStyle, "none">;
  /** vị trí nhãn mặc định trong Cấu hình (ảnh chưa chọn riêng) */
  defaultLabelPos?: LabelPos;
}) {
  const [images, setImages] = useState(initialImages);
  const [zoom, setZoom] = useState<ImageView | null>(null);
  // chọn chất liệu khách ưng ý bằng cách bấm số trên ảnh catalog, rồi sang Bước 2
  const canPick = !isDesign && !!designHref;
  const [selected, setSelected] = useState<string[]>([]);
  const [showNumbers, setShowNumbers] = useState(true);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  const [receivedAt, setReceivedAt] = useState(() => performance.now());
  const inFlight = useRef(false);
  const router = useRouter();

  const open = images.some((i) => !isFinished(i.status));
  const done = images.filter((i) => i.status === "SUCCESS").length;
  const failed = images.filter((i) => i.status === "FAILED").length;

  // chất liệu đã chọn -> nơi xuất hiện đầu tiên (ảnh nào, số mấy)
  const pickedInfo = selected.flatMap((id) => {
    for (const img of images) {
      const cell = img.pick?.cells.find((c) => c.materialId === id);
      if (cell) return [{ id, cell, label: img.label }];
    }
    return [];
  });
  const designUrl = designHref && selected.length > 0 ? `${designHref}?m=${selected.join(",")}` : designHref;

  function toggleCell(cell: SelectableCell) {
    if (selected.includes(cell.materialId)) return setSelected(selected.filter((id) => id !== cell.materialId));
    if (selected.length >= MAX_DESIGN_MATERIALS) return void toast.error(`Một lần thiết kế tối đa ${MAX_DESIGN_MATERIALS} chất liệu.`);
    setSelected([...selected, cell.materialId]);
  }

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
        <CardContent className="flex flex-col gap-2.5">
          {open ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-medium">
                  <Loader2Icon className="size-4 animate-spin" />
                  Đang tạo ảnh: xong {done}/{images.length}
                  {failed > 0 && <span className="text-red-600"> · {failed} lỗi</span>}
                </p>
                <p
                  className="text-sm tabular-nums text-muted-foreground"
                  title="Tiến độ là ước tính theo thời gian chờ (kie.ai không báo phần trăm thật). Để trang này mở, trang tự cập nhật khi xong."
                >
                  Ước tính {overall}% · đã chờ {formatElapsed(longest)}
                </p>
              </div>
              <ProgressBar percent={overall} label="Tiến độ tạo ảnh" className="h-2" />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className={cn("flex items-center gap-2 font-medium", failed > 0 ? "text-amber-700" : "text-emerald-700")}>
                  {failed > 0 ? <AlertTriangleIcon className="size-5" /> : <CheckCircle2Icon className="size-5" />}
                  {failed > 0 ? `${done} ảnh xong, ${failed} lỗi (bấm Tạo lại ở ảnh lỗi)` : `Hoàn thành ${done}/${images.length} ảnh`}
                </p>
                {done > 0 && (
                  <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <a
                      href={`/api/sessions/${sessionId}/download?format=zip`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}
                      title="Tải tất cả ảnh (ZIP)"
                    >
                      <DownloadIcon /> ZIP
                    </a>
                    <a
                      href={`/api/sessions/${sessionId}/download?format=pdf`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8")}
                      title="Tải tất cả ảnh thành một file PDF"
                    >
                      <FileTextIcon /> PDF
                    </a>
                    <CopyImagesButton
                      label="Copy"
                      className="h-8"
                      images={images
                        .filter((i) => i.status === "SUCCESS" && i.finalUrl)
                        .map((i) => ({ id: i.id, label: i.label, url: copySourceUrl(i.id) }))}
                    />
                    {canRefinish && (
                      <LabelPositionButton
                        sessionId={sessionId}
                        title="Cả phiên"
                        buttonLabel="Nhãn"
                        buttonTitle="Chỉnh kiểu và vị trí nhãn của tất cả ảnh"
                        currentStyle={labelMode}
                        currentPos={defaultLabelPos}
                        imageCount={done}
                        onDone={refresh}
                      />
                    )}
                    {canRefinish && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={refinish}
                        disabled={refinishing}
                        title="Vẽ lại khung và nhãn theo cấu hình mới nhất (tên xưởng, ghi chú chân ảnh...). Không gọi AI nên không tốn token."
                      >
                        {refinishing ? <Loader2Icon className="animate-spin" /> : <PaletteIcon />}
                        Vẽ lại
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {done > 0 && designHref && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
                  <Link href={designUrl ?? designHref} className={cn(buttonVariants({ size: "default" }), "h-10 px-4")}>
                    <PaletteIcon />{" "}
                    {isDesign
                      ? "Thiết kế thêm theo chất liệu khác"
                      : selected.length > 0
                        ? `Bước 2: Chọn kiểu thiết kế (${selected.length})`
                        : "Bước 2: Thiết kế theo chất liệu khách chọn"}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {isDesign
                      ? "Chọn thêm chất liệu hoặc loại sản phẩm khác."
                      : selected.length > 0
                        ? "Chọn tiếp ở ảnh khác hoặc sang Bước 2 ngay."
                        : "Bấm số dưới mỗi ảnh để chọn chất liệu khách ưng ý."}
                  </span>
                  {selected.length > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>
                      Bỏ chọn
                    </Button>
                  )}
                </div>
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
              picker={canPick && img.pick ? { cells: img.pick.cells, selected, onToggle: toggleCell } : null}
            />
          </li>
        ))}
      </ul>

      {canPick && done > 0 && selected.length > 0 && designUrl && (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-background/95 p-3 shadow-lg backdrop-blur">
          <p className="text-sm font-medium">
            Đã chọn <b>{selected.length}</b> chất liệu
            <span className="hidden text-muted-foreground sm:inline">
              {" "}
              ({pickedInfo.map((p) => `${p.label.replace("Ảnh ", "")}·${p.cell.number}`).join(", ")})
            </span>
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>
            Bỏ chọn
          </Button>
          <Link href={designUrl} className={cn(buttonVariants({ size: "lg" }), "ml-auto h-11 px-5")}>
            <PaletteIcon /> Bước 2: Chọn kiểu thiết kế ({selected.length})
          </Link>
        </div>
      )}

      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl">
          <DialogTitle>{zoom?.label}</DialogTitle>
          <DialogDescription className={canPick && zoom?.pick ? undefined : "sr-only"}>
            {canPick && zoom?.pick
              ? `Bấm vào số để chọn chất liệu khách ưng ý (một hoặc nhiều số, tối đa ${MAX_DESIGN_MATERIALS}), rồi sang Bước 2.`
              : "Ảnh phóng to"}
          </DialogDescription>

          {zoom?.finalUrl && canPick && zoom.pick ? (
            <>
              <CellSelectImage
                key={zoom.id}
                url={zoom.finalUrl}
                alt={zoom.label}
                aspectRatio={zoom.pick.aspectRatio}
                cols={zoom.pick.cols}
                rows={zoom.pick.rows}
                cells={zoom.pick.cells}
                selected={selected}
                onToggle={toggleCell}
                showNumbers={showNumbers}
              />
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={showNumbers} onChange={(e) => setShowNumbers(e.target.checked)} className="size-4" />
                Hiện số trên ảnh (bỏ tích để xem ảnh rõ hơn, vẫn bấm chọn được)
              </label>
            </>
          ) : (
            zoom?.finalUrl && <img src={zoom.finalUrl} alt={zoom.label} className="w-full rounded-lg border" />
          )}

          {canPick && (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">
                Đã chọn {selected.length}/{MAX_DESIGN_MATERIALS} chất liệu
              </p>
              {pickedInfo.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {pickedInfo.map((p) => (
                    <li key={p.id} className="flex items-center gap-1.5 rounded-full border bg-card py-1 pr-1 pl-2 text-sm">
                      <span className="rounded bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                        {p.label.replace("Ảnh ", "")}·{p.cell.number}
                      </span>
                      <span className="max-w-56 truncate">
                        {p.cell.code} - {p.cell.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelected(selected.filter((x) => x !== p.id))}
                        className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                        aria-label={`Bỏ ${p.cell.code}`}
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {canPick && designUrl && (
              <Link
                href={designUrl}
                aria-disabled={selected.length === 0}
                className={cn(buttonVariants({ className: "h-10" }), selected.length === 0 && "pointer-events-none opacity-50")}
              >
                <PaletteIcon /> Bước 2: Chọn kiểu thiết kế{selected.length > 0 ? ` (${selected.length})` : ""}
              </Link>
            )}
            {zoom?.downloadUrl && (
              <a href={zoom.downloadUrl} className={buttonVariants({ variant: "outline", className: "h-10" })}>
                <DownloadIcon /> Tải ảnh về
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function stageText(img: ImageView): string {
  if (img.status === "PENDING") return img.attempt > 1 ? `Đang gửi lại (lần ${img.attempt})...` : "Đang xếp hàng và gửi ảnh tham chiếu...";
  return img.attempt > 1 ? `AI đang tạo ảnh (thử lại lần ${img.attempt})...` : "AI đang tạo ảnh...";
}

function ImageCard({
  img,
  percent,
  elapsedMs,
  onZoom,
  onRetried,
  picker,
}: {
  /** ảnh catalog: các nút số để chọn nhanh chất liệu (null = không chọn được) */
  picker: {
    cells: { number: number; materialId: string; code: string; name: string }[];
    selected: string[];
    onToggle: (cell: SelectableCell) => void;
  } | null;
  img: ImageView;
  percent: number;
  elapsedMs: number;
  onZoom: () => void;
  onRetried: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const pickedCount = picker ? picker.cells.filter((c) => picker.selected.includes(c.materialId)).length : 0;

  function retry() {
    if (!window.confirm("Tạo lại ảnh này sẽ tốn thêm một lượt. Tiếp tục?")) return;
    startTransition(async () => {
      const r = await retryImageAction(img.id);
      if (r.error) return void toast.error(r.error);
      toast.success("Đã bắt đầu tạo lại.");
      onRetried();
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 truncate font-medium" title={img.label}>
            {img.label}
          </p>
          {img.quality && (
            <Badge variant="secondary" title="AI vẽ từng mảnh 4 chất liệu rồi ghép lại, mỗi mảnh tính một lượt">
              Chất lượng cao
            </Badge>
          )}
          {pickedCount > 0 && <Badge variant="outline" className="border-primary text-primary">Đã chọn {pickedCount}</Badge>}
          {img.status !== "SUCCESS" && <StatusBadge img={img} />}
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
          <Alert variant={img.errorHint?.kind === "admin" ? "default" : "destructive"} className={img.errorHint?.kind === "admin" ? "border-amber-500/40 bg-amber-500/10" : undefined}>
            <AlertTriangleIcon />
            <AlertDescription>
              {img.errorHint?.message ?? 'Không tạo được ảnh này. Bạn bấm "Tạo lại" để thử lần nữa.'}
              {img.errorDetail && <span className="mt-1 block text-xs opacity-80">Chi tiết (admin): {img.errorDetail}</span>}
            </AlertDescription>
          </Alert>
        )}

        {/* một hàng: các số để chọn chất liệu (bên trái), các biểu tượng thao tác (bên phải) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {img.status === "SUCCESS" && picker && (
            <div className="flex flex-wrap gap-1" role="group" aria-label={`Chọn chất liệu khách ưng ý trong ${img.label}`}>
              {picker.cells.map((cell) => {
                const on = picker.selected.includes(cell.materialId);
                return (
                  <button
                    key={cell.number}
                    type="button"
                    onClick={() => picker.onToggle(cell)}
                    aria-pressed={on}
                    title={`Chọn số ${cell.number}: ${cell.code} - ${cell.name}`}
                    aria-label={`Số ${cell.number}: ${cell.code} - ${cell.name}`}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md border text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                    )}
                  >
                    {cell.number}
                  </button>
                );
              })}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {img.downloadUrl && (
              <a
                href={img.downloadUrl}
                className={cn(buttonVariants({ variant: "outline", size: "icon" }), "size-8")}
                title="Tải ảnh về"
                aria-label={`Tải ${img.label} về`}
              >
                <DownloadIcon />
              </a>
            )}
            {img.status === "SUCCESS" && img.finalUrl && <CopyImageIconButton url={copySourceUrl(img.id)} label={img.label} />}
            {img.canRetry && (
              <Button
                type="button"
                variant={img.status === "FAILED" ? "default" : "outline"}
                size={img.status === "FAILED" ? "sm" : "icon"}
                className={img.status === "FAILED" ? "h-8" : "size-8"}
                onClick={retry}
                disabled={pending}
                title="Tạo lại trang này (tốn một lượt)"
                aria-label={`Tạo lại ${img.label}`}
              >
                {pending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                {img.status === "FAILED" && "Tạo lại"}
              </Button>
            )}
          </div>
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
