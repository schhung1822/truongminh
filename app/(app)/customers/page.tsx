import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { loadCustomerOptions } from "@/lib/wizard-data";
import { CustomerBrowser } from "./customer-browser";

export const metadata: Metadata = { title: "Khách hàng" };

export default async function CustomersPage() {
  const user = await requireUser();
  const customers = await loadCustomerOptions(user);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Khách hàng</h1>
        <p className="text-muted-foreground">
          Mỗi khách hàng là một thư mục, bên trong là thương hiệu và logo. Mở logo để xem các phiên đã làm hoặc tạo phiên mới.
        </p>
      </div>
      <CustomerBrowser customers={customers} />
    </div>
  );
}
