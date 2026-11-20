"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/zalo", label: "Tổng quan" },
  { href: "/admin/zalo/accounts", label: "Tài khoản cá nhân" },
  { href: "/admin/zalo/groups", label: "Nhóm và gửi ảnh" },
  { href: "/admin/zalo/bot", label: "Trợ lý AI" },
  { href: "/admin/zalo/staff", label: "Nhân viên và lệnh" },
  { href: "/admin/zalo/care", label: "Chăm sóc nhóm" },
];

/** Thanh mục con của khu Cài đặt Zalo. Tổng quan chỉ sáng khi đúng /admin/zalo, các mục khác sáng cả với trang con. */
export function ZaloTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Các mục cài đặt Zalo" className="flex flex-wrap items-center gap-1.5 border-b pb-3">
      {TABS.map((t) => {
        const active = t.href === "/admin/zalo" ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");
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
      <Link href="/zalo/guide" className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <BookOpenIcon className="size-4" /> Hướng dẫn sử dụng
      </Link>
    </nav>
  );
}
