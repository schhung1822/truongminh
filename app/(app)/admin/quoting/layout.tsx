import { requireAdmin } from "@/lib/auth/dal";
import { QuotingTabs } from "./quoting-tabs";

export default async function QuotingAdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Thiết lập báo giá</h1>
        <p className="max-w-3xl text-muted-foreground">
          Thông số ở đây quyết định giá bán. Mọi thay đổi được ghi lại ở mục Lịch sử thay đổi. Thiếu thông số thì công cụ báo giá không ra giá.
        </p>
      </div>
      <QuotingTabs />
      {children}
    </div>
  );
}
