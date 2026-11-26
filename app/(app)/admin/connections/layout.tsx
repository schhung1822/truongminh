import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { canManageFb } from "@/lib/fb/access";
import { ConnectionsTabs } from "./connections-tabs";

/**
 * Khu Hệ thống > Kết nối: mọi kết nối của hệ thống với dịch vụ bên ngoài nằm ở một chỗ (docs/DECISIONS.md D116).
 * Quản trị viên thấy tất cả; Marketing chỉ vào được mục Extension Facebook để quản lý nick và mã kết nối của mình
 * (từng trang con tự kiểm tra quyền lại, khung này chỉ chặn sớm vai trò không liên quan).
 */
export default async function ConnectionsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!canManageFb(user.role)) redirect("/");
  const isAdmin = user.role === "ADMIN";
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Kết nối</h1>
        <p className="max-w-3xl text-muted-foreground">
          {isAdmin
            ? "Nơi quản lý mọi kết nối của hệ thống với dịch vụ bên ngoài: extension Chrome quét Facebook, Pinterest, kie.ai và Zalo."
            : "Nick Facebook và mã kết nối extension của bạn."}
        </p>
      </div>
      <ConnectionsTabs isAdmin={isAdmin} />
      {children}
    </div>
  );
}
