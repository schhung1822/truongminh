"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2Icon, RotateCwIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { retryAutoAnalysisAction } from "../actions";

const REFRESH_MS = 3000;

/**
 * Hiện ở trang phiên khi phiên "AI chọn chất liệu" chưa có ảnh nào: AI đang phân tích logo (tự làm mới trang vài giây một
 * lần cho tới khi ảnh xuất hiện), hoặc phân tích đã hỏng (hiện đúng lý do, cho thử lại hoặc chuyển sang chọn trang mẫu).
 */
export function AiAnalysisStatus({
  sessionId,
  logoId,
  state,
  error,
  startedAt,
  requested,
  pinDesign = false,
  canRetry,
}: {
  sessionId: string;
  logoId: string;
  state: "analyzing" | "failed";
  error?: string;
  /** mốc bắt đầu phân tích (ms), để hiện số giây đã chờ */
  startedAt?: number;
  requested: number;
  /** phiên thiết kế theo mẫu Pinterest (D125): AI chọn chất liệu theo cả logo lẫn mẫu, ảnh ra là ảnh thiết kế */
  pinDesign?: boolean;
  canRetry: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [elapsed, setElapsed] = useState(0);

  // Đang phân tích: hỏi lại máy chủ định kỳ. Ảnh được tạo xong là trang tự chuyển sang màn hình tiến độ như phiên thường.
  useEffect(() => {
    if (state !== "analyzing") return;
    const refresh = setInterval(() => router.refresh(), REFRESH_MS);
    const tick = setInterval(() => setElapsed(startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0), 1000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [state, startedAt, router]);

  if (state === "analyzing") {
    return (
      <Card role="status">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2Icon className="size-5 animate-spin" /> AI đang xem logo và chọn chất liệu
          </CardTitle>
          <CardDescription>
            AI đang chọn {requested > 0 ? `${requested} chất liệu` : "các chất liệu"} hợp nhất với {pinDesign ? "logo và mẫu Pinterest đã chọn" : "logo này"}, thường mất khoảng nửa phút đến một phút{elapsed > 0 ? ` (đã chờ ${elapsed} giây)` : ""}.{" "}
            {pinDesign ? "Ảnh thiết kế" : "Ảnh mẫu"} sẽ tự hiện ở đây khi AI chọn xong. Bạn có thể rời trang, việc này vẫn chạy tiếp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative h-2.5 w-full max-w-md overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-y-0 w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertTitle>AI chưa chọn được chất liệu cho logo này</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{error}</span>
        <span className="text-foreground">Chưa có ảnh nào được tạo và bạn không bị trừ lượt nào.</span>
        <span className="flex flex-wrap gap-2">
          {canRetry && (
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await retryAutoAnalysisAction(sessionId);
                  if (r.error) toast.error(r.error);
                  else toast.success("AI đang phân tích lại logo.");
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2Icon className="animate-spin" /> : <RotateCwIcon />}
              Thử lại
            </Button>
          )}
          {pinDesign ? (
            <Link href={`/customers?logoId=${encodeURIComponent(logoId)}`} className={cn(buttonVariants({ variant: "outline" }))}>
              <SparklesIcon /> Về logo này để chọn lại mẫu
            </Link>
          ) : (
            <Link href={`/?logoId=${encodeURIComponent(logoId)}`} className={cn(buttonVariants({ variant: "outline" }))}>
              <SparklesIcon /> Tự chọn trang mẫu cho logo này
            </Link>
          )}
        </span>
      </AlertDescription>
    </Alert>
  );
}
