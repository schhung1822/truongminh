import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Trang chính" };

export default async function HomePage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Xin chào, {user.name}</h1>
        <p className="text-muted-foreground">Bắt đầu một phiên tư vấn mới hoặc xem lại các phiên gần đây.</p>
      </div>

      <Button size="lg" className="h-14 w-full text-base sm:w-auto sm:px-8" disabled>
        Tạo phiên tư vấn mới
      </Button>
      <p className="-mt-3 text-xs text-muted-foreground">Chức năng này sẽ mở ở giai đoạn tiếp theo.</p>

      <Card>
        <CardHeader>
          <CardTitle>Phiên gần đây</CardTitle>
          <CardDescription>Chưa có phiên nào.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Các phiên bạn tạo sẽ hiện ở đây.
        </CardContent>
      </Card>
    </div>
  );
}
