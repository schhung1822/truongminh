"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LayoutGridIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { autoCatalogSessionAction, createAllMaterialsSessionAction } from "@/app/(app)/sessions/actions";
import type { QuotaInfo, SheetOption } from "@/app/(app)/sessions/new/sheets-steps";
import type { PinDesignData } from "@/components/pinterest/pin-design-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { estimateCost, formatCostLabel } from "@/lib/pricing";
import { ACTION_BUTTON_CLASS, ActionLabel } from "./action-label";
import { QualityToggle } from "./quality-toggle";

/** Ước tính cho một cách tạo ảnh: số chất liệu, số ảnh, số lượt nếu bật chất lượng cao (D120), độ phân giải để tính chi phí. */
export type CreateEstimate = { count: number; images: number; resolution: string; qualityTasks: number };

export type QuickCreateData = {
  /** các trang mẫu MẶC ĐỊNH đang bật và dùng được: được tick sẵn khi bấm "Chọn bộ chất liệu" */
  defaultSheets: SheetOption[];
  quota: QuotaInfo;
  /** đang dùng kie.ai thật: hiện chi phí ước tính */
  showCost: boolean;
  /** model tạo ảnh đang cấu hình, dùng để tra đúng bảng giá (lib/providers/kie-models.ts) */
  imageModel: string;
  /** AI chọn chất liệu theo logo (D115) */
  auto: CreateEstimate;
  /** tạo ảnh với TẤT CẢ chất liệu đang bật (D126) */
  allMaterials: CreateEstimate;
  isAdmin: boolean;
  /** ô "Chất lượng cao" mặc định bật hay tắt (Quản trị > Cấu hình) */
  qualityDefault: boolean;
  /** thông số cho hộp "Thiết kế theo mẫu Pinterest" (D125) */
  design: PinDesignData;
};

const SERVER_UNREACHABLE = "Không gọi được máy chủ: có thể mất mạng, máy chủ đang khởi động lại, hoặc trang này mở từ trước một bản cập nhật. Hãy tải lại trang (F5) rồi bấm lại.";

/**
 * Hai cách tạo phiên ngay cho logo đã chọn, không qua bước chọn trang mẫu (D126):
 * - "AI chọn chất liệu": AI xem logo, chọn các chất liệu hợp nhất rồi tạo ảnh mẫu (D115).
 * - "Tất cả chất liệu": tạo ảnh với mọi chất liệu đang bật; tốn nhiều lượt nên hỏi xác nhận trước.
 * Các nút còn lại ("Chọn bộ chất liệu", "Mẫu Pinterest") do nơi gọi đặt qua `children`.
 */
export function QuickCreate({
  logoId,
  data,
  children,
}: {
  logoId: string;
  data: QuickCreateData;
  /** các nút đặt cạnh, ví dụ "Chọn bộ chất liệu" */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<"ai" | "all" | null>(null);
  const { quota, showCost, imageModel, auto, allMaterials: all } = data;
  const [quality, setQuality] = useState(data.qualityDefault);
  // số lượt = số tác vụ AI: thường mỗi ảnh một lượt, chất lượng cao thì mỗi mảnh 4 chất liệu một lượt (D120)
  const autoTasks = quality ? auto.qualityTasks : auto.images;
  const allTasks = quality ? all.qualityTasks : all.images;
  const autoOverQuota = quota !== null && autoTasks > quota.left;
  const allOverQuota = quota !== null && allTasks > quota.left;
  const noQuota = `Không đủ lượt hôm nay (còn ${quota?.left ?? 0})`;
  const hint = (e: CreateEstimate, tasks: number, lead: string) => `${lead} · ${e.images} ảnh${tasks !== e.images ? `, tính ${tasks} lượt` : ""}`;

  function startAuto() {
    setError(null);
    setRunning("ai");
    startTransition(async () => {
      try {
        const r = await autoCatalogSessionAction(logoId, quality);
        if (r.error || !r.sessionId) return setError(r.error ?? "Không tạo được phiên.");
        toast.success("AI đang xem logo và chọn chất liệu. Ảnh mẫu sẽ tự hiện ở trang phiên.");
        router.push(`/sessions/${r.sessionId}`);
      } catch (e) {
        console.error("AI chọn chất liệu thất bại:", e);
        setError(SERVER_UNREACHABLE);
      }
    });
  }

  function startAll() {
    // nhiều ảnh, nhiều lượt: hỏi lại trước khi tạo
    const left = quota ? ` Bạn còn ${quota.left} lượt hôm nay.` : "";
    if (!window.confirm(`Tạo ảnh với tất cả ${all.count} chất liệu: ${all.images} ảnh, tính ${allTasks} lượt.${left}\n\nTiếp tục?`)) return;
    setError(null);
    setRunning("all");
    startTransition(async () => {
      try {
        const r = await createAllMaterialsSessionAction(logoId, quality);
        if (r.error || !r.sessionId) return setError(r.error ?? "Không tạo được phiên.");
        toast.success(`Đã bắt đầu tạo ${all.images} ảnh với tất cả chất liệu.`);
        router.push(`/sessions/${r.sessionId}`);
      } catch (e) {
        console.error("Tạo ảnh với tất cả chất liệu thất bại:", e);
        setError(SERVER_UNREACHABLE);
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

      <div className="flex flex-wrap items-stretch gap-3">
        {auto.count > 0 && (
          <Button type="button" className={ACTION_BUTTON_CLASS} onClick={startAuto} disabled={pending || autoOverQuota}>
            {pending && running === "ai" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            <ActionLabel
              title={pending && running === "ai" ? "Đang bắt đầu..." : "AI chọn chất liệu"}
              hint={autoOverQuota ? noQuota : hint(auto, autoTasks, `${auto.count} chất liệu hợp logo nhất`)}
            />
          </Button>
        )}
        {all.count > 0 && (
          <Button type="button" variant="outline" className={ACTION_BUTTON_CLASS} onClick={startAll} disabled={pending || allOverQuota}>
            {pending && running === "all" ? <Loader2Icon className="animate-spin" /> : <LayoutGridIcon />}
            <ActionLabel
              title={pending && running === "all" ? "Đang bắt đầu..." : "Tất cả chất liệu"}
              hint={allOverQuota ? noQuota : hint(all, allTasks, `Cả ${all.count} chất liệu`)}
              warn={allOverQuota}
            />
          </Button>
        )}
        {children}
      </div>

      {auto.count === 0 && all.count === 0 && (
        <Alert className="max-w-xl">
          <AlertDescription>Chưa có chất liệu nào đang bật và có ảnh tham chiếu nên chưa tạo ảnh được.</AlertDescription>
        </Alert>
      )}

      <QualityToggle compact checked={quality} onChange={setQuality} disabled={pending} />

      {/* Chi phí ước tính của hai nút tạo ngay (chỉ hiện khi dùng kie.ai thật) */}
      {showCost && (auto.count > 0 || all.count > 0) && (
        <p className="text-xs text-muted-foreground">
          Chi phí ước tính:
          {auto.count > 0 && <> AI chọn chất liệu {formatCostLabel(estimateCost(imageModel, Array<string>(autoTasks).fill(auto.resolution)))}</>}
          {auto.count > 0 && all.count > 0 && " ·"}
          {all.count > 0 && <> Tất cả chất liệu {formatCostLabel(estimateCost(imageModel, Array<string>(allTasks).fill(all.resolution)))}</>}
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
