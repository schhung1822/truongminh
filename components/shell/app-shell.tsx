"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDownIcon, CircleUserIcon, LogOutIcon, MenuIcon } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { HeaderStats } from "./header-stats";
import { activeHref, visibleNav, type NavGroup, type NavItem } from "./nav-config";

type ShellUser = { name: string; email: string; role: "ADMIN" | "SALE" };

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  const base = "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors";

  if (!item.ready) {
    return (
      <span className={cn(base, "cursor-not-allowed text-muted-foreground/60")} aria-disabled="true">
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
        active
          ? "bg-background font-medium text-foreground shadow-xs ring-1 ring-black/5"
          : "text-foreground/80 hover:bg-background/60 hover:text-foreground",
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} />
      {item.label}
    </Link>
  );
}

/** Một nhóm menu: bấm tiêu đề để thu gọn/mở. Nhóm đang chứa trang hiện tại luôn mở. */
function NavGroupBlock({ group, activePath, onNavigate }: { group: NavGroup; activePath: string | null; onNavigate?: () => void }) {
  const hasActive = group.items.some((i) => i.href === activePath);
  const [open, setOpen] = useState(true);
  const shown = open || hasActive;
  return (
    <div className="mt-4 first:mt-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={shown}
        className="flex w-full items-center justify-between rounded-md px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {group.label}
        <ChevronDownIcon className={cn("size-3.5 transition-transform", !shown && "-rotate-90")} />
      </button>
      {shown && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} active={item.href === activePath} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function NavList({ role, onNavigate }: { role: ShellUser["role"]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = visibleNav(role);
  const activePath = activeHref(pathname, groups);
  return (
    <nav className="flex flex-col" aria-label="Menu chính">
      {groups.map((g) => (
        <NavGroupBlock key={g.id} group={g} activePath={activePath} onNavigate={onNavigate} />
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
          <span className="text-[10px] text-white/60">{user.role === "ADMIN" ? "Quản trị viên" : "Sale"}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        </DropdownMenuGroup>
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
          <SheetContent side="left" className="flex w-72 flex-col gap-4 bg-muted p-4">
            <SheetHeader className="p-0">
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto">
              <NavList role={user.role} onNavigate={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <Logo />
        <div className="ml-auto flex items-center gap-2">
          <HeaderStats role={user.role} />
          <UserMenu user={user} />
        </div>
      </header>

      <div className="flex min-w-0 flex-1">
        {/* Thanh menu bên trái cho máy tính */}
        <aside className="sticky top-14 hidden h-[calc(100svh-3.5rem)] w-60 shrink-0 overflow-y-auto bg-muted px-3 py-4 md:block">
          <NavList role={user.role} />
        </aside>

        <main className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
