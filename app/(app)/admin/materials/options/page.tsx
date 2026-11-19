import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { countOptionUsage } from "@/lib/materials/option-usage";
import { OPTION_TYPES, OPTION_TYPE_INFO } from "@/lib/materials/option-types";
import { OptionsBoard } from "./options-board";

export const metadata: Metadata = { title: "Danh mục chất liệu" };

export default async function MaterialOptionsPage() {
  await requireAdmin();
  const [options, usage] = await Promise.all([
    db.materialOption.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    countOptionUsage(),
  ]);

  const groups = OPTION_TYPES.map((type) => ({
    type,
    title: OPTION_TYPE_INFO[type].title,
    hint: OPTION_TYPE_INFO[type].hint,
    items: options
      .filter((o) => o.type === type)
      .map((o) => ({ id: o.id, value: o.value, label: o.label, sortOrder: o.sortOrder, isActive: o.isActive, used: usage[type][o.value] ?? 0 })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Danh mục chất liệu</h1>
          <p className="text-muted-foreground">
            Các giá trị để chọn khi nhập chất liệu và để lọc. Có thể thêm, sửa nhãn, đổi thứ tự và tắt; mã không dấu (value) không đổi được sau khi tạo.
          </p>
        </div>
        <Link href="/admin/materials" className={buttonVariants({ variant: "outline", className: "h-10" })}>
          <ArrowLeftIcon /> Về danh sách chất liệu
        </Link>
      </div>
      <OptionsBoard groups={groups} />
    </div>
  );
}
