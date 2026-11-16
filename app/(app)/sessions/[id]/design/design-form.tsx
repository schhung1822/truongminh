"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { CheckIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_VARIANTS, MAX_VARIANTS, MIN_VARIANTS, validateDesignRequest } from "@/lib/design/assign";
import { PRODUCT_TYPE_SUGGESTIONS } from "@/lib/design/product-types";
import { estimateCost } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { QuotaInfo } from "../../new/sheets-steps";
import { createDesignSessionAction } from "../../actions";

export type DesignMaterial = {
  id: string;
  code: string;
  name: string;
  groupName: string;
  printTech: string;
  imageUrl: string | null;
};

export function DesignForm({
  parentSessionId,
  materials,
  styleNames,
  resolution,
  aspectRatio,
  quota,
  showCost,
  isAdmin,
}: {
  parentSessionId: string;
  materials: DesignMaterial[];
  styleNames: string[];
  resolution: string;
  aspectRatio: string;
  quota: QuotaInfo;
  showCost: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [productType, setProductType] = useState("");
  const [variants, setVariants] = useState(DEFAULT_VARIANTS);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = selected.length * variants;
  const problem = useMemo(
    () => (selected.length === 0 ? null : validateDesignRequest({ materialCount: selected.length, variants, productType: "x" })),
    [selected.length, variants],
  );
  const cost = estimateCost(Array(total).fill(resolution));
  const overQuota = quota !== null && total > quota.left;
  const noStyles = styleNames.length === 0;
  const canStart =
    selected.length > 0 && productType.trim().length > 0 && !problem && !overQuota && !noStyles && !pending;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function start() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await createDesignSessionAction({ parentSessionId, materialIds: selected, productType, variants, note });
        if (r.error || !r.sessionId) return setError(r.error ?? "Không tạo được lượt thiết kế.");
        toast.success("Đã bắt đầu thiết kế. Đang chuyển sang màn hình theo dõi tiến độ...");
        router.push(`/sessions/${r.sessionId}`);
      } catch (e) {
        console.error("Bắt đầu thiết kế thất bại:", e);
        setError("Không gửi được yêu cầu tới máy chủ. Vui lòng bấm lại.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>1. Chất liệu khách ưng ý</CardTitle>
          <CardDescription>
            Đã chọn {selected.length}/{materials.length}. Mỗi chất liệu được chọn sẽ ra nhiều phương án thiết kế khác nhau.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setSelected(materials.map((m) => m.id))}>
              Chọn tất cả
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])} disabled={selected.length === 0}>
              Bỏ chọn
            </Button>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {materials.map((m) => {
              const on = selected.includes(m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => toggle(m.id)}
                    aria-pressed={on}
                    className={cn(
                      "relative flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card text-left transition-all hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      on && "border-primary ring-2 ring-primary",
                    )}
                  >
                    <span className="flex aspect-11/5 items-center justify-center border-b bg-white p-1">
                      {m.imageUrl && <img src={m.imageUrl} alt={m.name} className="max-h-full max-w-full object-contain" />}
                    </span>
                    <span className="flex flex-col gap-0.5 p-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{m.code}</span>
                      <span className="line-clamp-2 text-sm leading-tight font-semibold">{m.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {m.groupName} · {m.printTech}
                      </span>
                    </span>
                    {on && (
                      <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                        <CheckIcon className="size-4" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Sản phẩm cần thiết kế</CardTitle>
          <CardDescription>Gõ loại sản phẩm hoặc bấm một gợi ý.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 sm:max-w-md">
            <Label htmlFor="product-type">Loại sản phẩm</Label>
            <Input
              id="product-type"
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              maxLength={200}
              list="product-type-options"
              placeholder="Ví dụ: móc khóa"
              className="h-10"
            />
            <datalist id="product-type-options">
              {PRODUCT_TYPE_SUGGESTIONS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
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

          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="variants">Số phương án mỗi chất liệu</Label>
              <NativeSelect id="variants" value={variants} onChange={(e) => setVariants(Number(e.target.value))}>
                {Array.from({ length: MAX_VARIANTS - MIN_VARIANTS + 1 }, (_, i) => MIN_VARIANTS + i).map((n) => (
                  <option key={n} value={n}>
                    {n} phương án
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="design-note">Ghi chú thêm (không bắt buộc)</Label>
              <Textarea
                id="design-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Ví dụ: khách thích tông màu trầm, logo đặt chính giữa, cần ảnh chụp trên nền gỗ"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Xác nhận</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {noStyles ? (
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
          ) : (
            <p className="text-sm text-muted-foreground">
              Có {styleNames.length} kiểu thiết kế đang bật: <b>{styleNames.join(", ")}</b>. Các phương án của cùng một chất
              liệu dùng kiểu khác nhau. Ảnh {aspectRatio}, {resolution}.
            </p>
          )}

          <p className="text-base">
            <b>{selected.length}</b> chất liệu × <b>{variants}</b> phương án = <b>{total}</b> ảnh
            {showCost && total > 0 && (
              <span className="text-amber-700">
                {" "}
                · khoảng {cost.credits} token (${cost.usd.toFixed(2)})
              </span>
            )}
            {quota && <span className="text-muted-foreground"> · còn {quota.left} lượt hôm nay</span>}
          </p>

          {problem && (
            <Alert variant="destructive">
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          )}
          {overQuota && (
            <Alert variant="destructive">
              <AlertDescription>Bạn còn {quota!.left} lượt nhưng cần {total} lượt. Hãy chọn ít ảnh hơn.</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" className="h-12 px-6 text-base" onClick={start} disabled={!canStart}>
              {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              {pending ? "Đang bắt đầu..." : "Bắt đầu thiết kế"}
            </Button>
            {!canStart && !pending && (
              <span className="text-sm text-muted-foreground">
                {selected.length === 0 ? "Hãy chọn ít nhất một chất liệu." : !productType.trim() ? "Hãy nhập loại sản phẩm." : ""}
              </span>
            )}
          </div>
          {pending && (
            <div className="relative h-2.5 w-full max-w-md overflow-hidden rounded-full bg-muted" role="status" aria-label="Đang gửi yêu cầu">
              <div className="absolute inset-y-0 w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
