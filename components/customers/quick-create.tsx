"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2Icon, ZapIcon } from "lucide-react";
import { toast } from "sonner";
import { createCatalogSessionAction } from "@/app/(app)/sessions/actions";
import type { QuotaInfo, SheetOption } from "@/app/(app)/sessions/new/sheets-steps";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { estimateCost } from "@/lib/pricing";

export type QuickCreateData = {
  /** các trang mẫu mặc định đang bật và dùng được */
  defaultSheets: SheetOption[];
  quota: QuotaInfo;
  /** đang dùng kie.ai thật: hiện chi phí ước tính */
  showCost: boolean;
  isAdmin: boolean;
};

/**
 * Nút "Tạo nhanh": tạo phiên ngay với trang mẫu MẶC ĐỊNH cho logo đã chọn, không cần chọn trang mẫu.
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
  const { defaultSheets, quota, showCost } = data;
  const count = defaultSheets.length;
  const overQuota = quota !== null && count > quota.left;
  const cost = estimateCost(defaultSheets.map((s) => s.resolution));

  function start() {
    setError(null);
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

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {count > 0 ? (
          <Button type="button" className="h-12 px-6 text-base" onClick={start} disabled={pending || overQuota}>
            {pending ? <Loader2Icon className="animate-spin" /> : <ZapIcon />}
            {pending ? "Đang bắt đầu..." : "Tạo nhanh"}
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

      {count > 0 && (
        <p className="text-sm text-muted-foreground">
          Tạo nhanh với trang mẫu mặc định: <b>{defaultSheets.map((s) => s.name).join(", ")}</b> ({count} ảnh)
          {showCost && <> · khoảng {cost.credits} token (${cost.usd.toFixed(2)})</>}
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
