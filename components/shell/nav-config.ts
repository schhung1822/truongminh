import {
  BarChart3Icon,
  BoxesIcon,
  HistoryIcon,
  HomeIcon,
  LayoutGridIcon,
  type LucideIcon,
  PaletteIcon,
  PlusCircleIcon,
  ScrollTextIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** false = chưa làm xong (hiện mờ, chưa bấm được). Bật dần theo từng giai đoạn. */
  ready: boolean;
};

export const mainNav: NavItem[] = [
  { href: "/", label: "Trang chính", icon: HomeIcon, ready: true },
  { href: "/sessions/new", label: "Tạo phiên mới", icon: PlusCircleIcon, ready: false },
  { href: "/history", label: "Lịch sử", icon: HistoryIcon, ready: false },
];

export const adminNav: NavItem[] = [
  { href: "/admin/materials", label: "Chất liệu", icon: BoxesIcon, ready: false },
  { href: "/admin/sheets", label: "Trang mẫu", icon: LayoutGridIcon, ready: false },
  { href: "/admin/prompts", label: "Prompt", icon: ScrollTextIcon, ready: false },
  { href: "/admin/design-styles", label: "Kiểu thiết kế", icon: PaletteIcon, ready: false },
  { href: "/admin/users", label: "Người dùng", icon: UsersIcon, ready: true },
  { href: "/admin/settings", label: "Cấu hình", icon: SettingsIcon, ready: false },
  { href: "/admin/usage", label: "Thống kê", icon: BarChart3Icon, ready: false },
];
