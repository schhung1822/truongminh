import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/dal";
import { getEnv } from "@/lib/env";
import { USD_PER_CREDIT } from "@/lib/pricing";
import { getKieCredits } from "@/lib/providers";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Cấu hình" };

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  const env = getEnv();
  const credits = env.IMAGE_PROVIDER === "kie" ? await getKieCredits() : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Cấu hình</h1>
        <p className="text-muted-foreground">Thay đổi có hiệu lực ngay cho các ảnh tạo từ lúc này trở đi.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Thiết lập chung</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm settings={settings} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Môi trường đang chạy</CardTitle>
          <CardDescription>Chỉ để xem. Đổi trong file .env trên máy chủ rồi khởi động lại.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          Nhà cung cấp ảnh AI:{" "}
          <b>{env.IMAGE_PROVIDER === "mock" ? "Ảnh giả (mock), không tốn tiền" : "kie.ai (tính tiền thật)"}</b>
          {env.IMAGE_PROVIDER === "kie" && (
            <p className="mt-2">
              Số dư kie.ai:{" "}
              <b>
                {credits === null
                  ? "không hỏi được (kiểm tra khóa API)"
                  : `${credits.toLocaleString("vi-VN")} credits (khoảng $${(credits * USD_PER_CREDIT).toFixed(2)})`}
              </b>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
