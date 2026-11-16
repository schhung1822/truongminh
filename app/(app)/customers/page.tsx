import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { pickDefaultSheets } from "@/lib/default-sheets";
import { loadCustomerOptions, loadSheetOptions } from "@/lib/wizard-data";
import { CustomerBrowser } from "./customer-browser";

export const metadata: Metadata = { title: "Khách hàng" };

export default async function CustomersPage() {
  const user = await requireUser();
  const [customers, { sheets, quota, showCost }] = await Promise.all([loadCustomerOptions(user), loadSheetOptions(user)]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Khách hàng</h1>
        <p className="text-muted-foreground">
          Mỗi khách hàng là một thư mục, bên trong là thương hiệu và logo. Mở logo rồi bấm <b>Tạo nhanh</b> để tạo ảnh ngay bằng
          trang mẫu mặc định, hoặc xem lại các phiên đã làm.
        </p>
      </div>
      <CustomerBrowser
        customers={customers}
        quick={{ defaultSheets: pickDefaultSheets(sheets), quota, showCost, isAdmin: user.role === "ADMIN" }}
      />
    </div>
  );
}
