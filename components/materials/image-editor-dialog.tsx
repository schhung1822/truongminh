"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2Icon, RotateCcwIcon, RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fullRect, moveRect, resizeRect, rotatedSize, type Handle, type Rect, type Rotation, type Size } from "@/lib/imaging/crop-math";

const PREVIEW_MAX = 420;
const MIN_CROP_PX = 24;
const HANDLES: Handle[] = ["nw", "ne", "sw", "se"];
const HANDLE_CURSOR: Record<Handle, string> = { nw: "cursor-nwse-resize", se: "cursor-nwse-resize", ne: "cursor-nesw-resize", sw: "cursor-nesw-resize" };
const HANDLE_POS: Record<Handle, string> = {
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2",
  sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2",
  se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2",
};

type Drag = { kind: "move" | Handle; startClientX: number; startClientY: number; startRect: Rect };

function outputMime(type: string): string {
  return type === "image/png" || type === "image/webp" ? type : "image/jpeg";
}

/**
 * Hộp thoại xoay 90°/cắt ảnh cơ bản cho ảnh mẫu chất liệu vừa chọn (component/materials/material-form.tsx).
 * Chỉ nhận File vừa chọn ở máy (blob: URL, cùng gốc nên vẽ canvas không bị CORS chặn) — không sửa ảnh đã lưu trên kho.
 * Vẽ ảnh đã xoay vào canvas đúng kích thước gốc (không thu nhỏ), chỉ thu nhỏ bằng CSS để xem; lúc "Dùng ảnh này"
 * cắt thẳng từ canvas đó ra nên ảnh xuất vẫn giữ nguyên độ phân giải gốc.
 */
export function ImageEditorDialog({ file, onConfirm, onCancel }: { file: File | null; onConfirm: (file: File) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Nạp ảnh mỗi khi đổi file: đặt lại góc xoay và khung cắt về trọn vẹn ảnh.
  useEffect(() => {
    if (!file) {
      imgRef.current = null;
      return;
    }
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      imgRef.current = img;
      const size = { w: img.naturalWidth, h: img.naturalHeight };
      setNatural(size);
      setRotation(0);
      setCrop(fullRect(size));
      setError(null);
    };
    img.onerror = () => {
      if (!cancelled) setError("Không đọc được ảnh này. Vui lòng chọn file khác.");
    };
    img.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const rotated = natural ? rotatedSize(natural, rotation) : null;
  const scale = rotated ? Math.min(PREVIEW_MAX / rotated.w, PREVIEW_MAX / rotated.h) : 1;
  const displayW = rotated ? Math.round(rotated.w * scale) : 0;
  const displayH = rotated ? Math.round(rotated.h * scale) : 0;

  // Vẽ ảnh đã xoay vào canvas ở ĐÚNG độ phân giải gốc (chỉ CSS thu nhỏ để xem) mỗi khi ảnh hoặc góc xoay đổi.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !natural || !rotated) return;
    canvas.width = rotated.w;
    canvas.height = rotated.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, rotated.w, rotated.h);
    ctx.save();
    ctx.translate(rotated.w / 2, rotated.h / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -natural.w / 2, -natural.h / 2);
    ctx.restore();
  }, [natural, rotated, rotation]);

  function rotateBy(delta: 90 | -90) {
    if (!natural) return;
    const next = (((rotation + delta) % 360) + 360) % 360 as Rotation;
    setRotation(next);
    setCrop(fullRect(rotatedSize(natural, next)));
  }

  function reset() {
    if (!natural) return;
    setRotation(0);
    setCrop(fullRect(natural));
  }

  useEffect(() => {
    if (!rotated) return;
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || !rotated) return;
      const dx = (e.clientX - drag.startClientX) / scale;
      const dy = (e.clientY - drag.startClientY) / scale;
      setCrop(drag.kind === "move" ? moveRect(drag.startRect, dx, dy, rotated) : resizeRect(drag.startRect, drag.kind, dx, dy, rotated, MIN_CROP_PX));
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [rotated, scale]);

  function startDrag(kind: Drag["kind"], e: React.PointerEvent) {
    if (!crop) return;
    e.preventDefault();
    dragRef.current = { kind, startClientX: e.clientX, startClientY: e.clientY, startRect: crop };
  }

  async function confirm() {
    const canvas = canvasRef.current;
    if (!canvas || !crop || !file) return;
    setBusy(true);
    try {
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(crop.w));
      out.height = Math.max(1, Math.round(crop.h));
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("no-ctx");
      ctx.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
      const mime = outputMime(file.type);
      const blob: Blob | null = await new Promise((resolve) => out.toBlob(resolve, mime, 0.92));
      if (!blob) throw new Error("no-blob");
      onConfirm(new File([blob], file.name, { type: mime }));
    } catch {
      setError("Không xuất được ảnh đã chỉnh. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Xoay và cắt ảnh</DialogTitle>
          <DialogDescription>Xoay cho thẳng rồi kéo khung để chỉ giữ lại phần chất liệu, bỏ bớt nền hoặc chi tiết thừa trong ảnh chụp.</DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => rotateBy(-90)} disabled={!natural}>
              <RotateCcwIcon /> Xoay trái
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => rotateBy(90)} disabled={!natural}>
              <RotateCwIcon /> Xoay phải
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={!natural}>
              Đặt lại
            </Button>
          </div>

          {natural && rotated && crop ? (
            <div style={{ width: displayW, height: displayH }} className="relative touch-none overflow-hidden rounded-lg border bg-muted select-none">
              <canvas ref={canvasRef} style={{ width: displayW, height: displayH }} className="block" />
              <div
                onPointerDown={(e) => startDrag("move", e)}
                className="absolute cursor-move border-2 border-primary"
                style={{
                  left: crop.x * scale,
                  top: crop.y * scale,
                  width: crop.w * scale,
                  height: crop.h * scale,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                }}
              >
                {HANDLES.map((h) => (
                  <div
                    key={h}
                    onPointerDown={(e) => startDrag(h, e)}
                    className={`absolute size-3.5 rounded-full border-2 border-primary bg-white ${HANDLE_POS[h]} ${HANDLE_CURSOR[h]}`}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div style={{ width: PREVIEW_MAX, height: PREVIEW_MAX / 2 }} className="flex items-center justify-center rounded-lg border bg-muted">
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Hủy
          </Button>
          <Button type="button" onClick={confirm} disabled={!crop || busy}>
            {busy && <Loader2Icon className="animate-spin" />}
            Dùng ảnh này
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
