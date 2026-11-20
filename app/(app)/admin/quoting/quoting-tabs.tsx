"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/quoting", label: "Tình trạng thông số" },
  { href: "/admin/quoting/materials", label: "Tấm vật liệu" },
  { href: "/admin/quoting/machines", label: "Thông số máy" },
  { href: "/admin/quoting/settings", label: "Cấu hình giá" },
  { href: "/admin/quoting/history", label: "Lịch sử thay đổi" },
  { href: "/admin/quoting/times", label: "Thời gian máy thực tế" },
  { href: "/admin/quoting/calibration", label: "Hiệu chỉnh" },
];

/** Thanh mục con của khu Thiết lập báo giá. Mục đầu chỉ sáng khi đúng /admin/quoting. */
export function QuotingTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Các mục thiết lập báo giá" className="flex flex-wrap items-center gap-1.5 border-b pb-3">
      {TABS.map((t) => {
        const active = t.href === "/admin/quoting" ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("rounded-full border px-3.5 py-1.5 text-sm transition-colors", active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
