import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/shell/app-shell";
import { ZALO_INBOX_HREF } from "@/components/shell/nav-config";
import { requireUser } from "@/lib/auth/dal";
import { getZaloSettings } from "@/lib/zalo/settings";

// Cả khu vực sau đăng nhập là nội dung theo người dùng, đọc lúc có request, nên không đòi điều hướng "tức thì".
export const instant = false;

// Đọc phiên đăng nhập (cookie) phải nằm trong <Suspense>, nếu không build sẽ lỗi (cacheComponents).
async function ShellWithUser({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Hộp thư Zalo đang tắt (Hệ thống > Cấu hình) thì ẩn luôn mục đó khỏi menu, không để một mục bấm vào chỉ thấy "đang tắt".
  const zalo = await getZaloSettings();
  const hiddenNav = zalo.inbox ? [] : [ZALO_INBOX_HREF];
  return (
    <AppShell user={{ name: user.name, email: user.email, role: user.role }} hiddenNav={hiddenNav}>
      {children}
    </AppShell>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col gap-4 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full max-w-3xl" />
        </div>
      }
    >
      <ShellWithUser>{children}</ShellWithUser>
    </Suspense>
  );
}
