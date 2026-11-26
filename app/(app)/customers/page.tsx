import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { pickDefaultSheets } from "@/lib/default-sheets";
import { loadCustomerOptions, loadLogoContext, loadSheetOptions } from "@/lib/wizard-data";
import { CustomerBrowser } from "./customer-browser";

export const metadata: Metadata = { title: "Khách hàng" };

/**
 * `?logoId=` mở thẳng tới logo đó (nút Quay lại ở trang phiên, và khi tải lại trang lúc đang xem một logo).
 * `?pin=` là mẫu đã chọn ở trang Mẫu Pinterest (nút "Thiết kế theo mẫu", D125): chọn logo xong thì hộp thiết kế theo mẫu tự mở.
 */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ logoId?: string; pin?: string }> }) {
  const user = await requireUser();
  const { logoId, pin: pinId } = await searchParams;
  const [customers, { sheets, quota, showCost, imageModel, auto, allMaterials, qualityDefault, design }, pin] = await Promise.all([
    loadCustomerOptions(user),
    loadSheetOptions(user),
    pinId ? db.pinterestPin.findUnique({ where: { id: pinId.slice(0, 191) }, select: { id: true, title: true, sourceImageUrl: true } }) : null,
  ]);

  const initial = logoId ? await loadLogoContext(user, logoId.slice(0, 191), customers) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Khách hàng</h1>
        <p className="text-muted-foreground">
          Mở thư mục khách hàng, chọn logo rồi tạo ảnh mẫu hoặc xem lại các phiên đã làm.
        </p>
      </div>
      <CustomerBrowser
        initial={initial}
        pin={pin}
        customers={customers}
        sheets={sheets}
        quick={{ defaultSheets: pickDefaultSheets(sheets), quota, showCost, imageModel, auto, allMaterials, isAdmin: user.role === "ADMIN", qualityDefault, design }}
      />
    </div>
  );
}
