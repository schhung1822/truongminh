"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2Icon, PinIcon, SparklesIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { createPinDesignSessionAction } from "@/app/(app)/sessions/actions";
import type { PickerPin } from "@/app/(app)/sessions/[id]/design/pinterest-actions";
import type { QuotaInfo } from "@/app/(app)/sessions/new/sheets-steps";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_DESIGN_MATERIALS,
  MAX_VARIANTS,
  MIN_VARIANTS,
  PIN_DESIGN_DEFAULT_MATERIALS,
  PIN_DESIGN_DEFAULT_VARIANTS,
  PIN_DESIGN_MAX_PINS,
  validatePinDesignRequest,
} from "@/lib/design/assign";
import { PRODUCT_TYPE_SUGGESTIONS } from "@/lib/design/product-types";
import { estimateCost, formatCostLabel } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { ACTION_BUTTON_CLASS, ActionLabel } from "@/components/customers/action-label";
import { PinLibraryBrowser, usePinLibrary } from "./pin-library";

/** Dữ liệu máy chủ cần cho hộp "Thiết kế theo mẫu Pinterest" (lib/wizard-data.ts). */
export type PinDesignData = {
  /** độ phân giải ảnh thiết kế đang cấu hình, để ước tính chi phí */
  resolution: string;
  /** số kiểu thiết kế đang bật (0 thì chưa thiết kế được) */
  styleCount: number;
  /** số chất liệu đang bật và có ảnh tham chiếu (AI chỉ chọn trong số này) */
  usableMaterials: number;
};

/**
 * Nút "Mẫu Pinterest" ở khung logo và hộp THIẾT KẾ THEO MẪU PINTEREST (D125): chọn 1-3 mẫu trong kho Pinterest, nhập loại
 * sản phẩm, rồi AI tự chọn chất liệu hợp với logo và mẫu và tạo ảnh thiết kế. Không cần có phiên ảnh chất liệu trước.
 * `initialPins`: mẫu đã chọn sẵn từ trang Mẫu Pinterest (nút "Thiết kế theo mẫu"), khi đó hộp tự mở.
 */
export function PinDesignDialog({
  logoId,
  design,
  quota,
  showCost,
  imageModel,
  isAdmin,
  initialPins = [],
}: {
  logoId: string;
  design: PinDesignData;
  quota: QuotaInfo;
  showCost: boolean;
  imageModel: string;
  isAdmin: boolean;
  initialPins?: PickerPin[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initialPins.length > 0);
  const [selected, setSelected] = useState<PickerPin[]>(initialPins.slice(0, PIN_DESIGN_MAX_PINS));
  const [productType, setProductType] = useState("");
  const maxMaterials = Math.max(1, Math.min(MAX_DESIGN_MATERIALS, design.usableMaterials));
  const [materialCount, setMaterialCount] = useState(Math.min(PIN_DESIGN_DEFAULT_MATERIALS, maxMaterials));
  const [variants, setVariants] = useState(PIN_DESIGN_DEFAULT_VARIANTS);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lib = usePinLibrary(logoId);

  // mở sẵn (đi từ trang Mẫu Pinterest sang): nạp kho mẫu ngay
  useEffect(() => {
    if (initialPins.length > 0) lib.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy một lần lúc hiện khung logo
  }, []);

  function toggle(pin: PickerPin) {
    setSelected((cur) => (cur.some((p) => p.id === pin.id) ? cur.filter((p) => p.id !== pin.id) : cur.length < PIN_DESIGN_MAX_PINS ? [...cur, pin] : cur));
  }

  const total = materialCount * variants;
  const problem = validatePinDesignRequest({ pinCount: Math.max(1, selected.length), materialCount, variants, productType: "x" });
  const overQuota = quota !== null && total > quota.left;
  const blocked = design.styleCount === 0 || design.usableMaterials === 0;
  const canStart = selected.length > 0 && productType.trim().length > 0 && !problem && !overQuota && !blocked && !pending;
  const cost = estimateCost(imageModel, Array<string>(total).fill(design.resolution));

  function start() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await createPinDesignSessionAction({ logoId, pinIds: selected.map((p) => p.id), productType, materialCount, variants, note });
        if (r.error || !r.sessionId) return setError(r.error ?? "Không tạo được lượt thiết kế.");
        toast.success("AI đang chọn chất liệu. Ảnh thiết kế sẽ tự hiện ở trang phiên.");
        // mẫu đã dùng xong: bỏ khỏi địa chỉ trang để bấm Quay lại không mở lại hộp này
        const url = new URL(window.location.href);
        if (url.searchParams.has("pin")) {
          url.searchParams.delete("pin");
          window.history.replaceState(null, "", url.pathname + url.search);
        }
        setOpen(false);
        router.push(`/sessions/${r.sessionId}`);
      } catch (e) {
        console.error("Thiết kế theo mẫu Pinterest thất bại:", e);
        setError("Không gọi được máy chủ: có thể mất mạng, máy chủ đang khởi động lại, hoặc trang này mở từ trước một bản cập nhật. Hãy tải lại trang (F5) rồi bấm lại.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) lib.load();
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" className={ACTION_BUTTON_CLASS} />}>
        <PinIcon />
        <ActionLabel title="Mẫu Pinterest" hint="Thiết kế theo mẫu khách thích" />
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Thiết kế theo mẫu Pinterest</DialogTitle>
          <DialogDescription>
            Chọn mẫu khách thích, AI sẽ tự chọn chất liệu hợp với logo và mẫu rồi vẽ logo lên sản phẩm. AI lấy màu sắc, bối cảnh và bố cục của mẫu, không chép lại logo hay nội dung trong mẫu.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section className="flex flex-col gap-2" aria-label="Chọn mẫu">
          <h3 className="font-medium">1. Chọn mẫu (1 đến {PIN_DESIGN_MAX_PINS} ảnh)</h3>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Mẫu đã chọn">
              {selected.map((pin) => (
                <div key={pin.id} className="relative size-16 overflow-hidden rounded-lg border ring-2 ring-primary">
                  <img src={pin.sourceImageUrl} alt={pin.title ?? "Mẫu đã chọn"} className="size-full object-cover" />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-0.5 right-0.5 size-5"
                    title="Bỏ mẫu này"
                    aria-label="Bỏ mẫu này"
                    onClick={() => toggle(pin)}
                  >
                    <XIcon className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="max-h-72 overflow-y-auto rounded-lg border p-2">
            <PinLibraryBrowser lib={lib} selected={selected} max={PIN_DESIGN_MAX_PINS} onToggle={toggle} gridClassName="sm:grid-cols-5" />
          </div>
          <p className="text-sm text-muted-foreground">
            Cần tìm kiếm, lọc theo phong cách hoặc lưu pin khách thích?{" "}
            <Link href={`/pinterest?logoId=${encodeURIComponent(logoId)}`} className="underline underline-offset-4">
              Mở kho mẫu đầy đủ
            </Link>
            , rồi bấm &quot;Thiết kế theo mẫu&quot; dưới ảnh muốn dùng.
          </p>
        </section>

        <section className="flex flex-col gap-3" aria-label="Sản phẩm">
          <h3 className="font-medium">2. Sản phẩm cần thiết kế</h3>
          <div className="flex flex-col gap-1.5 sm:max-w-md">
            <Label htmlFor="pin-product-type">Loại sản phẩm</Label>
            <Input id="pin-product-type" value={productType} onChange={(e) => setProductType(e.target.value)} maxLength={200} placeholder="Ví dụ: móc khóa" className="h-10" />
          </div>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_TYPE_SUGGESTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProductType(p)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted",
                  productType === p && "border-primary bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pin-material-count">Số chất liệu AI chọn</Label>
              <NativeSelect id="pin-material-count" value={materialCount} onChange={(e) => setMaterialCount(Number(e.target.value))}>
                {Array.from({ length: maxMaterials }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} chất liệu
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pin-variants">Số phương án mỗi chất liệu</Label>
              <NativeSelect id="pin-variants" value={variants} onChange={(e) => setVariants(Number(e.target.value))}>
                {Array.from({ length: MAX_VARIANTS - MIN_VARIANTS + 1 }, (_, i) => MIN_VARIANTS + i).map((n) => (
                  <option key={n} value={n}>
                    {n} phương án
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pin-note">Ghi chú thêm (không bắt buộc)</Label>
            <Textarea id="pin-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Ví dụ: khách thích tông màu trầm, logo đặt chính giữa" />
          </div>
        </section>

        <section className="flex flex-col gap-3 border-t pt-3" aria-label="Xác nhận">
          {design.usableMaterials === 0 ? (
            <Alert variant="destructive">
              <AlertDescription>Chưa có chất liệu nào đang bật và có ảnh tham chiếu.</AlertDescription>
            </Alert>
          ) : design.styleCount === 0 ? (
            <Alert variant="destructive">
              <AlertDescription>
                Chưa có kiểu thiết kế nào đang bật.{" "}
                {isAdmin ? (
                  <Link href="/admin/design-styles" className="underline">
                    Thêm ở Quản trị &gt; Kiểu thiết kế
                  </Link>
                ) : (
                  "Nhờ quản trị viên thêm kiểu thiết kế."
                )}
              </AlertDescription>
            </Alert>
          ) : null}

          <p className="text-base">
            <b>{materialCount}</b> chất liệu × <b>{variants}</b> phương án = <b>{total}</b> ảnh
            {showCost && total > 0 && <span className="text-amber-700"> · {formatCostLabel(cost)}</span>}
            {quota && <span className="text-muted-foreground"> · còn {quota.left} lượt hôm nay</span>}
          </p>
          {problem && (
            <Alert variant="destructive">
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          )}
          {overQuota && (
            <Alert variant="destructive">
              <AlertDescription>
                Bạn còn {quota!.left} lượt nhưng cần {total} lượt. Hãy chọn ít chất liệu hoặc ít phương án hơn.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" className="h-12 px-6 text-base" onClick={start} disabled={!canStart}>
              {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              {pending ? "Đang bắt đầu..." : "Bắt đầu thiết kế"}
            </Button>
            {!canStart && !pending && !blocked && (
              <span className="text-sm text-muted-foreground">
                {selected.length === 0 ? "Hãy chọn ít nhất một mẫu." : !productType.trim() ? "Hãy nhập loại sản phẩm." : ""}
              </span>
            )}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
