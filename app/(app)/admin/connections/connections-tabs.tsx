"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PlatformIcon, type Platform } from "./platform-icon";

const TABS: { href: string; label: string; adminOnly: boolean; platform?: Platform }[] = [
  { href: "/admin/connections", label: "Tổng quan", adminOnly: true },
  { href: "/admin/connections/extension", label: "Extension Facebook", adminOnly: false, platform: "facebook" },
  { href: "/admin/connections/pinterest", label: "Pinterest", adminOnly: true, platform: "pinterest" },
  { href: "/admin/connections/kie", label: "Kie.ai", adminOnly: true, platform: "kie" },
  { href: "/admin/connections/zalo", label: "Zalo", adminOnly: true, platform: "zalo" },
];

/**
 * Thanh mục con của khu Hệ thống > Kết nối. Marketing chỉ quản lý extension của mình nên chỉ thấy đúng mục đó
 * (một mục thì không cần thanh chọn). Tổng quan chỉ sáng khi đúng /admin/connections.
 */
export function ConnectionsTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => isAdmin || !t.adminOnly);
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Các kết nối của hệ thống" className="flex flex-wrap items-center gap-1.5 border-b pb-3">
      {tabs.map((t) => {
        const active = t.href === "/admin/connections" ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors", active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {/* nền trắng để logo có phần trong suốt (chữ P của Pinterest, logo kie.ai) vẫn rõ trên mục đang chọn màu tối */}
            {t.platform && <PlatformIcon platform={t.platform} className="size-[18px] rounded bg-white p-0.5" />}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
