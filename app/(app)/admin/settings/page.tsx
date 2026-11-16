import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/dal";
import { getEnv } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Cấu hình" };

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  const env = getEnv();

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
        </CardContent>
      </Card>
    </div>
  );
}
