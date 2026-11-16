"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOutIcon, MenuIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { logoutAction } from "@/app/(auth)/actions";
import { HeaderStats } from "./header-stats";
import { adminNav, mainNav, type NavItem } from "./nav-config";

type ShellUser = { name: string; email: string; role: "ADMIN" | "SALE" };

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const Icon = item.icon;
  const base = "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors";

  if (!item.ready) {
    return (
      <span className={cn(base, "cursor-not-allowed text-muted-foreground/60")} aria-disabled="true">
        <Icon className="size-4" />
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
        active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
      )}
    >
      <Icon className="size-4" />
      {item.label}
    </Link>
  );
}

function NavList({ role, onNavigate }: { role: ShellUser["role"]; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Menu chính">
      {mainNav.map((item) => (
        <NavLink key={item.href} item={item} onNavigate={onNavigate} />
      ))}
      {role === "ADMIN" && (
        <>
          <p className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quản trị
          </p>
          {adminNav.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </>
      )}
    </nav>
  );
}

function UserBox({ user }: { user: ShellUser }) {
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <div className="px-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {user.role === "ADMIN" ? "Quản trị viên" : "Sale"} · {user.email}
        </p>
      </div>
      <form action={logoutAction}>
        <Button type="submit" variant="outline" className="h-9 w-full">
          <LogOutIcon />
          Đăng xuất
        </Button>
      </form>
    </div>
  );
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-svh flex-1">
      {/* Thanh bên cho máy tính */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-4 border-r bg-sidebar p-4 md:flex">
        <p className="px-3 text-base font-semibold">Ảnh mẫu in logo</p>
        <div className="flex-1 overflow-y-auto">
          <NavList role={user.role} />
        </div>
        <UserBox user={user} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Thanh đầu trang: nút menu (điện thoại) bên trái, thống kê token bên phải */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-3 md:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="outline" size="icon" aria-label="Mở menu" className="md:hidden" />}>
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col gap-4 p-4">
              <SheetHeader className="p-0">
                <SheetTitle>Ảnh mẫu in logo</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto">
                <NavList role={user.role} onNavigate={() => setOpen(false)} />
              </div>
              <UserBox user={user} />
            </SheetContent>
          </Sheet>
          <p className="text-sm font-semibold md:hidden">Ảnh mẫu in logo</p>
          <div className="ml-auto">
            <HeaderStats role={user.role} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
