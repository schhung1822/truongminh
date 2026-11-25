"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2Icon, SparklesIcon, ZapIcon } from "lucide-react";
import { toast } from "sonner";
import { autoCatalogSessionAction, createCatalogSessionAction } from "@/app/(app)/sessions/actions";
import type { QuotaInfo, SheetOption } from "@/app/(app)/sessions/new/sheets-steps";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { estimateCost, formatCostLabel } from "@/lib/pricing";

export type QuickCreateData = {
  /** các trang mẫu mặc định đang bật và dùng được */
  defaultSheets: SheetOption[];
  quota: QuotaInfo;
  /** đang dùng kie.ai thật: hiện chi phí ước tính */
  showCost: boolean;
  /** model tạo ảnh đang cấu hình, dùng để tra đúng bảng giá (lib/providers/kie-models.ts) */
  imageModel: string;
  /** AI chọn chất liệu theo logo (D115): số chất liệu, số ảnh sẽ tạo và độ phân giải, để hiện ước tính */
  auto: { count: number; images: number; resolution: string };
  isAdmin: boolean;
};

/**
 * Hai cách tạo phiên ngay cho logo đã chọn, không qua bước chọn trang mẫu:
 * - "AI chọn chất liệu": AI xem logo, chọn các chất liệu hợp nhất rồi tạo ảnh mẫu (D115).
 * - "Tạo nhanh": dùng các trang mẫu MẶC ĐỊNH.
 * Cần chọn trang khác thì dùng nút bên cạnh (do nơi gọi đặt, qua `children`).
 */
export function QuickCreate({
  logoId,
  data,
  children,
}: {
  logoId: string;
  data: QuickCreateData;
  /** các nút phụ đặt cạnh nút Tạo nhanh, ví dụ "Chọn trang mẫu khác" */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<"ai" | "quick" | null>(null);
  const { defaultSheets, quota, showCost, imageModel, auto } = data;
  const count = defaultSheets.reduce((n, s) => n + s.images, 0); // số ảnh (trang dài chia nhiều ảnh)
  const overQuota = quota !== null && count > quota.left;
  const cost = estimateCost(imageModel, defaultSheets.flatMap((s) => Array<string>(s.images).fill(s.resolution)));
  const autoOverQuota = quota !== null && auto.images > quota.left;
  const autoCost = estimateCost(imageModel, Array<string>(auto.images).fill(auto.resolution));

  function start() {
    setError(null);
    setRunning("quick");
    startTransition(async () => {
      try {
        const r = await createCatalogSessionAction(
          logoId,
          defaultSheets.map((s) => s.id),
        );
        if (r.error || !r.sessionId) return setError(r.error ?? "Không tạo được phiên.");
        toast.success("Đã bắt đầu tạo ảnh với trang mẫu mặc định.");
        router.push(`/sessions/${r.sessionId}`);
      } catch (e) {
        console.error("Tạo nhanh thất bại:", e);
        setError("Không gửi được yêu cầu tới máy chủ. Vui lòng bấm lại.");
      }
    });
  }

  function startAuto() {
    setError(null);
    setRunning("ai");
    startTransition(async () => {
      try {
        const r = await autoCatalogSessionAction(logoId, false);
        if (r.error || !r.sessionId) return setError(r.error ?? "Không tạo được phiên.");
        toast.success("AI đã chọn xong chất liệu, đang tạo ảnh mẫu.");
        router.push(`/sessions/${r.sessionId}`);
      } catch (e) {
        console.error("AI chọn chất liệu thất bại:", e);
        setError("Không gửi được yêu cầu tới máy chủ. Vui lòng bấm lại.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {auto.count > 0 && (
          <Button type="button" className="h-12 px-6 text-base" onClick={startAuto} disabled={pending || autoOverQuota}>
            {pending && running === "ai" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            {pending && running === "ai" ? "AI đang phân tích logo..." : "AI chọn chất liệu"}
          </Button>
        )}
        {defaultSheets.length > 0 ? (
          <Button type="button" variant="outline" className="h-12 px-5" onClick={start} disabled={pending || overQuota}>
            {pending && running === "quick" ? <Loader2Icon className="animate-spin" /> : <ZapIcon />}
            {pending && running === "quick" ? "Đang bắt đầu..." : "Tạo nhanh"}
          </Button>
        ) : (
          <Alert className="max-w-xl">
            <AlertDescription>
              Chưa có trang mẫu mặc định nên chưa dùng được nút Tạo nhanh.{" "}
              {data.isAdmin ? (
                <>
                  Hãy đặt ở{" "}
                  <Link href="/admin/sheets" className="underline">
                    Quản trị &gt; Trang mẫu
                  </Link>
                  .
                </>
              ) : (
                "Nhờ quản trị viên đặt một trang mẫu mặc định, hoặc chọn trang mẫu ở nút bên cạnh."
              )}
            </AlertDescription>
          </Alert>
        )}
        {children}
      </div>

      {auto.count > 0 && (
        <p className="text-sm text-muted-foreground">
          AI chọn chất liệu: AI xem logo rồi chọn <b>{auto.count} chất liệu</b> hợp nhất ({auto.images} ảnh), mất thêm khoảng nửa phút để
          phân tích
          {showCost && <> · {formatCostLabel(autoCost)}</>}
          {autoOverQuota && <span className="text-red-600"> · bạn không còn đủ lượt hôm nay (còn {quota!.left})</span>}
        </p>
      )}
      {defaultSheets.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Tạo nhanh với trang mẫu mặc định: <b>{defaultSheets.map((s) => s.name).join(", ")}</b> ({count} ảnh)
          {showCost && <> · {formatCostLabel(cost)}</>}
          {overQuota && <span className="text-red-600"> · bạn không còn đủ lượt hôm nay (còn {quota!.left})</span>}
        </p>
      )}

      {pending && (
        <div className="relative h-2.5 w-full max-w-md overflow-hidden rounded-full bg-muted" role="status" aria-label="Đang gửi yêu cầu">
          <div className="absolute inset-y-0 w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
      )}
    </div>
  );
}
