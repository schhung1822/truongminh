import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/dal";
import { getSettings } from "@/lib/settings";
import { getZaloSettings } from "@/lib/zalo/settings";
import { FeatureToggles } from "./feature-toggles";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Cấu hình" };

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, zalo] = await Promise.all([getSettings(), getZaloSettings()]);

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
          <CardTitle>Bật / tắt chức năng</CardTitle>
          <CardDescription>Chức năng đang tắt thì ẩn khỏi menu của mọi người. Gạt là lưu ngay.</CardDescription>
        </CardHeader>
        <CardContent>
          <FeatureToggles zaloInbox={zalo.inbox} />
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        Kết nối kie.ai (chế độ ảnh thật hay ảnh giả, khóa API, số dư) xem ở{" "}
        <Link href="/admin/connections/kie" className="underline underline-offset-4">
          Hệ thống &gt; Kết nối &gt; Kie.ai
        </Link>
        .
      </p>
    </div>
  );
}
