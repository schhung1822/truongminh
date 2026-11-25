import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { pickDefaultSheets } from "@/lib/default-sheets";
import { loadCustomerOptions, loadSheetOptions } from "@/lib/wizard-data";
import { CustomerBrowser } from "./customer-browser";

export const metadata: Metadata = { title: "Khách hàng" };

export default async function CustomersPage() {
  const user = await requireUser();
  const [customers, { sheets, quota, showCost, imageModel, auto }] = await Promise.all([loadCustomerOptions(user), loadSheetOptions(user)]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Khách hàng</h1>
        <p className="text-muted-foreground">
          Mỗi khách hàng là một thư mục, bên trong là thương hiệu và logo. Tải logo mới lên thì AI tự chọn các chất liệu hợp và tạo ảnh
          mẫu ngay; với logo có sẵn, mở logo rồi bấm <b>AI chọn chất liệu</b>, hoặc xem lại các phiên đã làm.
        </p>
      </div>
      <CustomerBrowser
        customers={customers}
        quick={{ defaultSheets: pickDefaultSheets(sheets), quota, showCost, imageModel, auto, isAdmin: user.role === "ADMIN" }}
      />
    </div>
  );
}
