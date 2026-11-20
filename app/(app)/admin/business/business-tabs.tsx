"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EyeIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/business", label: "Hồ sơ doanh nghiệp" },
  { href: "/admin/business/articles", label: "Bài kiến thức" },
  { href: "/admin/business/pricing", label: "Thông số tính giá" },
  { href: "/admin/business/try", label: "Thử AI" },
  { href: "/admin/business/gaps", label: "Câu hỏi chưa trả lời" },
  { href: "/admin/business/log", label: "Nhật ký dùng" },
];

/** Thanh mục con của khu Thông tin doanh nghiệp. Mục đầu chỉ sáng khi đúng /admin/business. */
export function BusinessTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Các mục thông tin doanh nghiệp" className="flex flex-wrap items-center gap-1.5 border-b pb-3">
      {TABS.map((t) => {
        const active = t.href === "/admin/business" ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        );
      })}
      <Link href="/business" className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <EyeIcon className="size-4" /> Xem như nhân viên sale
      </Link>
    </nav>
  );
}
