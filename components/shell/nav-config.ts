import {
  BarChart3Icon,
  BoxesIcon,
  FolderTreeIcon,
  HistoryIcon,
  HomeIcon,
  LayoutGridIcon,
  type LucideIcon,
  PaletteIcon,
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
  { href: "/customers", label: "Khách hàng", icon: FolderTreeIcon, ready: true },
  { href: "/history", label: "Lịch sử", icon: HistoryIcon, ready: true },
];

export const adminNav: NavItem[] = [
  { href: "/admin/materials", label: "Chất liệu", icon: BoxesIcon, ready: true },
  { href: "/admin/sheets", label: "Trang mẫu", icon: LayoutGridIcon, ready: true },
  { href: "/admin/prompts", label: "Prompt", icon: ScrollTextIcon, ready: true },
  { href: "/admin/design-styles", label: "Kiểu thiết kế", icon: PaletteIcon, ready: true },
  { href: "/admin/users", label: "Người dùng", icon: UsersIcon, ready: true },
  { href: "/admin/settings", label: "Cấu hình", icon: SettingsIcon, ready: true },
  { href: "/admin/usage", label: "Thống kê", icon: BarChart3Icon, ready: true },
];
