"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, TagIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  LABEL_POSITIONS,
  LABEL_POS_TEXT,
  LABEL_STYLES,
  LABEL_STYLE_HINT,
  LABEL_STYLE_TEXT,
  styleHasPosition,
  type LabelPos,
  type LabelStyle,
} from "@/lib/imaging/label-pos";
import { cn } from "@/lib/utils";
import { setLabelPositionAction } from "../actions";

/** Khung ô ảnh giả để minh họa. */
function Frame({ children }: { children?: React.ReactNode }) {
  return (
    <span className="relative block h-12 w-full overflow-hidden rounded-md border bg-linear-to-br from-muted to-muted-foreground/20">
      {children}
    </span>
  );
}

/** Minh họa một kiểu nhãn (thẻ đầy đủ rộng, thẻ gọn hẹp nhiều dòng, số nhỏ + bảng dưới, không nhãn). */
function StyleDiagram({ style }: { style: LabelStyle }) {
  if (style === "overlay")
    return (
      <Frame>
        <span className="absolute right-1 bottom-1 left-1 h-3 rounded-[3px] border border-black/30 bg-white shadow-sm" />
      </Frame>
    );
  if (style === "compact")
    return (
      <Frame>
        <span className="absolute right-1 bottom-1 flex h-6 w-9 flex-col gap-0.5 rounded-[3px] border border-black/30 bg-white p-0.5 shadow-sm">
          <span className="h-1 w-4 rounded-sm bg-black/70" />
          <span className="h-1 w-full rounded-sm bg-black/30" />
          <span className="h-1 w-5 rounded-sm bg-black/20" />
        </span>
      </Frame>
    );
  if (style === "legend")
    return (
      <span className="block">
        <Frame>
          <span className="absolute top-1 left-1 flex size-3.5 items-center justify-center rounded-full bg-black/75 text-[8px] leading-none text-white">1</span>
        </Frame>
        <span className="mt-0.5 block h-1 w-3/4 rounded-sm bg-black/20" />
      </span>
    );
  return (
    <Frame>
      <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Không chữ</span>
    </Frame>
  );
}

/** Minh họa một vị trí của thẻ trong ô. */
function PositionDiagram({ pos }: { pos: LabelPos }) {
  return (
    <Frame>
      <span
        className={cn(
          "absolute h-2.5 w-7 rounded-[3px] border border-black/30 bg-white shadow-sm",
          pos[0] === "t" ? "top-1" : "bottom-1",
          pos[1] === "l" ? "left-1" : pos[1] === "r" ? "right-1" : "left-1/2 -translate-x-1/2",
        )}
      />
    </Frame>
  );
}

function OptionButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-2 text-left text-xs transition-colors hover:bg-muted",
        selected && "border-primary bg-primary/5 ring-1 ring-primary",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Nút "Nhãn": chọn KIỂU nhãn (thẻ đầy đủ, thẻ gọn, đánh số + chú giải, ẩn) và VỊ TRÍ thẻ trong ô,
 * để nhãn dài không che logo. Áp dụng cho ảnh này hoặc cả phiên; vẽ lại ngay, không gọi AI nên không tốn token.
 */
export function LabelPositionButton({
  sessionId,
  imageId,
  title,
  buttonLabel = "Nhãn",
  buttonTitle,
  currentStyle,
  currentPos,
  imageCount,
  onDone,
}: {
  sessionId: string;
  /** bỏ trống = chỉnh nhãn của TẤT CẢ ảnh trong phiên */
  imageId?: string;
  title: string;
  buttonLabel?: string;
  /** chú thích khi rê chuột vào nút */
  buttonTitle?: string;
  /** kiểu và vị trí đang áp dụng cho ảnh này (đã tính cả mặc định trong Cấu hình) */
  currentStyle: LabelStyle;
  currentPos: LabelPos;
  /** số ảnh đã xong trong phiên, để hiện ở tùy chọn "áp dụng cho cả phiên" */
  imageCount: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<LabelStyle>(currentStyle);
  const [pos, setPos] = useState<LabelPos>(currentPos);
  const [all, setAll] = useState(false);
  const [pending, startTransition] = useTransition();
  const hasPos = styleHasPosition(style);

  function apply() {
    startTransition(async () => {
      const r = await setLabelPositionAction({ sessionId, imageId: imageId && !all ? imageId : undefined, labelStyle: style, labelPos: pos });
      if (r.error) return void toast.error(r.error);
      toast.success(r.count && r.count > 1 ? `Đã đổi nhãn của ${r.count} ảnh.` : "Đã đổi nhãn.");
      setOpen(false);
      onDone();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        title={buttonTitle}
        onClick={() => {
          setStyle(currentStyle);
          setPos(currentPos);
          setAll(false);
          setOpen(true);
        }}
      >
        <TagIcon /> {buttonLabel}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogTitle>Nhãn chất liệu</DialogTitle>
          <DialogDescription>
            {imageId ? `${title}: ` : ""}chọn kiểu và vị trí nhãn để không che logo hay phần đẹp của ảnh.
          </DialogDescription>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Kiểu nhãn</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kiểu nhãn">
              {LABEL_STYLES.map((s) => (
                <OptionButton key={s} selected={style === s} onClick={() => setStyle(s)}>
                  <StyleDiagram style={s} />
                  <span className="font-medium">{LABEL_STYLE_TEXT[s]}</span>
                  <span className="text-muted-foreground">{LABEL_STYLE_HINT[s]}</span>
                </OptionButton>
              ))}
            </div>
          </div>

          <div className={cn("flex flex-col gap-2", !hasPos && "opacity-50")}>
            <p className="text-sm font-medium">
              Vị trí thẻ trong ô{!hasPos && <span className="font-normal text-muted-foreground"> (kiểu này không có thẻ trong ô)</span>}
            </p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Vị trí nhãn">
              {LABEL_POSITIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={pos === p}
                  disabled={!hasPos}
                  onClick={() => setPos(p)}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-lg border p-2 text-xs transition-colors enabled:hover:bg-muted",
                    pos === p && hasPos && "border-primary bg-primary/5 ring-1 ring-primary",
                  )}
                >
                  <PositionDiagram pos={p} />
                  <span className="text-center font-medium">{LABEL_POS_TEXT[p]}</span>
                </button>
              ))}
            </div>
          </div>

          {!imageId && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">Áp dụng cho tất cả {imageCount} ảnh của phiên.</p>
          )}
          {imageId && imageCount > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="size-4" />
              Áp dụng cho cả {imageCount} ảnh của phiên
            </label>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" className="h-10 px-5" onClick={apply} disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              {pending ? "Đang vẽ lại..." : "Áp dụng"}
            </Button>
            <Button type="button" variant="outline" className="h-10" onClick={() => setOpen(false)} disabled={pending}>
              Hủy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Chỉ vẽ lại phần nhãn, không gọi AI nên không tốn token.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
