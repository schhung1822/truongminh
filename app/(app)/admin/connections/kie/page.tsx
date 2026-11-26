import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/dal";
import { getEnv } from "@/lib/env";
import { USD_PER_CREDIT } from "@/lib/pricing";
import { getKieCredits } from "@/lib/providers";
import { kieModel } from "@/lib/providers/kie-models";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { getZaloSettings } from "@/lib/zalo/settings";
import { PlatformIcon } from "../platform-icon";
import { InfoRow, StatusPill } from "../status";
import { KieCheckButton } from "./kie-check-button";

export const metadata: Metadata = { title: "Kết nối: kie.ai" };

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{children}</code>;
}

export default async function KieConnectionPage() {
  await requireAdmin();
  const env = getEnv();
  const live = env.IMAGE_PROVIDER === "kie";
  const [credits, settings, zalo] = await Promise.all([live ? getKieCredits() : Promise.resolve(null), getSettings(), getZaloSettings()]);
  const model = kieModel(settings.imageModel);
  const callbackUrl = `${env.APP_URL.replace(/\/+$/, "")}/api/webhooks/kie`;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <PlatformIcon platform="kie" className="size-6" />
            Kie.ai
            {!live ? (
              <StatusPill tone="off">Đang dùng ảnh giả</StatusPill>
            ) : credits === null ? (
              <StatusPill tone="error">Không hỏi được số dư</StatusPill>
            ) : (
              <StatusPill tone="ok">Đang kết nối</StatusPill>
            )}
          </CardTitle>
          <CardDescription>Dịch vụ AI tạo ảnh mẫu, ảnh thiết kế và chạy các trợ lý chat (đọc logo chọn chất liệu, trợ lý Zalo, AI soạn câu trả lời). Một khóa API dùng chung cho tất cả.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl>
            <InfoRow label="Chế độ">{live ? <b>kie.ai (tính tiền thật)</b> : <b>Ảnh giả (mock), không tốn tiền</b>}</InfoRow>
            <InfoRow label="Khóa API">
              {env.KIE_API_KEY ? (
                <>
                  Đã có, kết thúc bằng <span className="font-mono">{env.KIE_API_KEY.slice(-4)}</span>
                  {!live && " (chưa dùng vì đang ở chế độ ảnh giả)"}
                </>
              ) : (
                "Chưa có"
              )}
            </InfoRow>
            {live && (
              <InfoRow label="Số dư">
                {credits === null ? (
                  <span className="text-red-600">Không hỏi được. Bấm &quot;Kiểm tra kết nối&quot; để xem lý do, thường là khóa API sai hoặc đã bị thu hồi.</span>
                ) : (
                  <b>
                    {credits.toLocaleString("vi-VN")} token (khoảng ${(credits * USD_PER_CREDIT).toFixed(2)})
                  </b>
                )}
              </InfoRow>
            )}
            <InfoRow label="Máy chủ API">
              <span className="font-mono text-xs">{env.KIE_API_BASE}</span>
            </InfoRow>
            <InfoRow label="Nhận kết quả">
              {env.KIE_CALLBACK_ENABLED ? (
                <>
                  kie.ai báo kết quả về <span className="font-mono text-xs break-all">{callbackUrl}</span>
                </>
              ) : (
                "Hệ thống tự hỏi kie.ai định kỳ (callback đang tắt)"
              )}
            </InfoRow>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <KieCheckButton disabled={!live} />
            <a href="https://kie.ai/api-key" target="_blank" rel="noreferrer noopener" className={cn(buttonVariants({ variant: "ghost" }))}>
              Quản lý khóa và nạp token ở kie.ai <ExternalLinkIcon />
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Đang dùng kết nối này cho</CardTitle>
          <CardDescription>Chọn model ở trang của từng chức năng, kết nối thì dùng chung ở đây.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl>
            <InfoRow label="Tạo ảnh">
              {model?.label ?? settings.imageModel} ·{" "}
              <Link href="/admin/settings" className="underline underline-offset-4">
                đổi ở Cấu hình
              </Link>
            </InfoRow>
            <InfoRow label="Trợ lý chat">
              <span className="font-mono text-xs">{zalo.chatModel}</span> ·{" "}
              <Link href="/admin/zalo/bot" className="underline underline-offset-4">
                đổi và thử ở Cài đặt Zalo &gt; Trợ lý AI
              </Link>
            </InfoRow>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Đổi khóa hoặc đổi chế độ</CardTitle>
          <CardDescription>Khóa kie.ai nằm trong file .env trên máy chủ, không nhập trên web.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Tạo hoặc lấy khóa ở kie.ai, dán vào <Code>KIE_API_KEY</Code> trong file .env.
            </li>
            <li>
              Đặt <Code>IMAGE_PROVIDER=&quot;kie&quot;</Code> để tạo ảnh thật, hoặc <Code>&quot;mock&quot;</Code> để chạy thử bằng ảnh giả không tốn tiền.
            </li>
            <li>Khởi động lại web rồi quay lại đây bấm &quot;Kiểm tra kết nối&quot;.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
