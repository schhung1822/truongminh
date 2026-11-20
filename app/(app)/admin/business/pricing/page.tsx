import type { Metadata } from "next";
import { LockIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { PricingBoard, type PricingRow } from "./pricing-board";

export const metadata: Metadata = { title: "Thông số tính giá" };

export default async function PricingPage() {
  await requireAdmin();
  const rows = await db.pricingParam.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] });
  const items: PricingRow[] = rows.map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    // Decimal không đi qua ranh giới server/client được: đổi sang chuỗi
    value: r.value === null ? null : r.value.toString(),
    unit: r.unit ?? "",
    note: r.note ?? "",
  }));

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        <LockIcon className="mt-0.5 size-4 shrink-0" />
        <span>
          <b>Chỉ admin thấy. Không AI trò chuyện nào đọc mục này.</b> Đây là nơi ghi các thông số nội bộ dùng để tính giá (giá vật liệu, hệ số, công...). Nhân viên sale không thấy trang này.
        </span>
      </p>
      <PricingBoard rows={items} />
    </div>
  );
}
