"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CircleUserIcon, LogOutIcon, MenuIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/generated/prisma/enums";
import { roleLabel } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { logoutAction } from "@/app/(auth)/actions";
import { AccountMenuStats, HeaderStats } from "./header-stats";
import { activeHref, visibleNav, type NavGroup, type NavItem } from "./nav-config";

type ShellUser = { name: string; email: string; role: Role };

const BADGE_REFRESH_MS = 30_000;

/** Số đếm việc cần chú ý cho từng mục menu, tải lại định kỳ (nhẹ, chỉ hỏi số lượng, không tải cả danh sách). */
function useNavBadges(): Record<string, number> {
  const [badges, setBadges] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/fb/leads/badge", { cache: "no-store" });
        if (!alive || !res.ok) return;
        const body = (await res.json()) as { count: number };
        setBadges((prev) => ({ ...prev, "/fb/leads": body.count }));
      } catch {
        /* bỏ qua, lần sau thử lại */
      }
    };
    void load();
    const t = setInterval(load, BADGE_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return badges;
}

/**
 * Gắn/gỡ lớp "is-scrolling" lên chính phần tử đang cuộn trong lúc có sự kiện scroll (rồi tự gỡ sau một lúc đứng
 * yên), để CSS (.sidebar-scroll trong globals.css) hiện thanh cuộn mảnh kiểu overlay như trên mobile: chỉ hiện khi
 * rê chuột vào hoặc đang cuộn, còn lại thì ẩn.
 */
function useRevealScrollbarOnScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let hideTimer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      el.classList.add("is-scrolling");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => el.classList.remove("is-scrolling"), 800);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      clearTimeout(hideTimer);
    };
  }, []);
  return ref;
}

function NavLink({
  item,
  active,
  badgeCount,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  badgeCount?: number;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const base = "flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13px] transition-colors";

  if (!item.ready) {
    return (
      <span className={cn(base, "cursor-not-allowed text-neutral-400")} aria-disabled="true">
        <Icon className="size-4" strokeWidth={1.75} />
        {item.label}
        <span className="ml-auto text-[10px] font-normal uppercase tracking-wide">Sắp có</span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        base,
        active ? "bg-white font-medium text-neutral-900 shadow-sm" : "text-neutral-600 hover:bg-white/70 hover:text-neutral-900",
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} />
      {item.label}
      {!!badgeCount && (
        <Badge variant="destructive" className="ml-auto h-5 min-w-5 justify-center rounded-full px-1 tabular-nums">
          {badgeCount > 99 ? "99+" : badgeCount}
        </Badge>
      )}
    </Link>
  );
}

/** Một nhóm menu: tiêu đề nhỏ, luôn hiện hết các mục bên dưới (không thu gọn) để danh sách gọn và dễ quét mắt. */
function NavGroupBlock({
  group,
  activePath,
  badges,
  onNavigate,
}: {
  group: NavGroup;
  activePath: string | null;
  badges: Record<string, number>;
  onNavigate?: () => void;
}) {
  return (
    <div className="mt-5 first:mt-0">
      <p className="px-3 text-xs text-muted-foreground/80">{group.label}</p>
      <div className="mt-1 flex flex-col gap-0.5">
        {group.items.map((item) => (
          <NavLink key={item.href} item={item} active={item.href === activePath} badgeCount={badges[item.href]} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

function NavList({ role, onNavigate }: { role: ShellUser["role"]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = visibleNav(role);
  const activePath = activeHref(pathname, groups);
  const badges = useNavBadges();
  return (
    <nav className="flex flex-col" aria-label="Menu chính">
      {groups.map((g) => (
        <NavGroupBlock key={g.id} group={g} activePath={activePath} badges={badges} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

/** Ô tài khoản ở góc phải thanh đầu trang: bấm mở menu có email và nút đăng xuất. */
function UserMenu({ user }: { user: ShellUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Tài khoản"
        className="flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2.5 text-left text-white outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <CircleUserIcon className="size-4 shrink-0 text-white/70" strokeWidth={1.75} />
        <span className="hidden min-w-0 flex-col leading-tight sm:flex">
          <span className="max-w-40 truncate text-xs font-semibold">{user.name}</span>
          <span className="text-[10px] text-white/60">{roleLabel(user.role)}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        </DropdownMenuGroup>
        {/* Số liệu token: ở màn rộng đã hiện sẵn trên thanh đầu trang nên chỉ lặp lại ở đây cho di động */}
        <div className="sm:hidden">
          <DropdownMenuSeparator />
          <AccountMenuStats />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void logoutAction()}>
          <LogOutIcon />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Logo() {
  return (
    <Link href="/" aria-label="Trường Minh - Trang chính" className="flex shrink-0 items-center">
      {/* Logo chữ trắng nền trong suốt nên chỉ dùng trên thanh đầu trang màu tối */}
      <img src="/images/logo_truongminh.png" alt="Trường Minh" className="-ml-1 h-12 w-auto" />
    </Link>
  );
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const desktopNavRef = useRevealScrollbarOnScroll<HTMLElement>();
  const mobileNavRef = useRevealScrollbarOnScroll<HTMLDivElement>();

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      {/* Thanh đầu trang màu tối: logo bên trái, thống kê token và tài khoản bên phải */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 bg-neutral-950 px-3 text-white md:px-6">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Mở menu"
                className="text-white hover:bg-white/10 hover:text-white md:hidden"
              />
            }
          >
            <MenuIcon />
          </SheetTrigger>
          <SheetContent side="left" className="flex w-72 flex-col gap-4 bg-sidebar p-4">
            <SheetHeader className="p-0">
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <div ref={mobileNavRef} className="sidebar-scroll flex-1 overflow-y-auto">
              <NavList role={user.role} onNavigate={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <Logo />
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <HeaderStats role={user.role} />
          </div>
          <UserMenu user={user} />
        </div>
      </header>

      <div className="flex min-w-0 flex-1">
        {/* Thanh menu bên trái cho máy tính */}
        <aside
          ref={desktopNavRef}
          className="sidebar-scroll sticky top-14 hidden h-[calc(100svh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar px-3 py-4 md:block"
        >
          <NavList role={user.role} />
        </aside>

        <main className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
