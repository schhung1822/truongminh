import {
  BarChart3Icon,
  BookOpenIcon,
  BoxesIcon,
  BrainIcon,
  BuildingIcon,
  CalculatorIcon,
  FolderTreeIcon,
  HistoryIcon,
  HomeIcon,
  InboxIcon,
  CalendarHeartIcon,
  LayoutGridIcon,
  MessageCircleIcon,
  type LucideIcon,
  PaletteIcon,
  ScrollTextIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** false = chưa làm xong (hiện mờ, chưa bấm được). Bật dần theo từng giai đoạn. */
  ready: boolean;
  /** true = chỉ quản trị viên thấy */
  adminOnly?: boolean;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

/**
 * Menu bên trái, chia theo nhóm để sau này thêm hạng mục mới không bị rối. Thêm hạng mục: thêm một dòng vào đúng nhóm
 * (hoặc thêm nhóm mới). Nhóm không còn mục nào hiển thị với người xem thì tự ẩn. Mỗi nhóm bấm vào tiêu đề để thu gọn.
 */
export const navGroups: NavGroup[] = [
  {
    id: "work",
    label: "Công việc",
    items: [
      { href: "/", label: "Trang chính", icon: HomeIcon, ready: true },
      { href: "/customers", label: "Khách hàng", icon: FolderTreeIcon, ready: true },
      { href: "/history", label: "Lịch sử", icon: HistoryIcon, ready: true },
    ],
  },
  {
    id: "zalo",
    label: "Zalo",
    items: [
      { href: "/zalo", label: "Hộp thư Zalo", icon: InboxIcon, ready: true },
      { href: "/zalo/care", label: "Kịch bản chăm sóc", icon: CalendarHeartIcon, ready: true },
      { href: "/zalo/guide", label: "Hướng dẫn Zalo", icon: BookOpenIcon, ready: true },
      { href: "/admin/zalo", label: "Cài đặt Zalo", icon: MessageCircleIcon, ready: true, adminOnly: true },
    ],
  },
  {
    id: "knowledge",
    label: "Kiến thức",
    items: [
      { href: "/business", label: "Kiến thức xưởng", icon: BrainIcon, ready: true },
      { href: "/admin/business", label: "Thông tin doanh nghiệp", icon: BuildingIcon, ready: true, adminOnly: true },
    ],
  },
  {
    id: "quote",
    label: "Báo giá",
    items: [
      { href: "/quote", label: "Báo giá sản xuất", icon: CalculatorIcon, ready: true },
      { href: "/admin/quoting", label: "Thiết lập báo giá", icon: SlidersHorizontalIcon, ready: true, adminOnly: true },
    ],
  },
  {
    id: "library",
    label: "Thư viện mẫu",
    items: [
      { href: "/admin/materials", label: "Chất liệu", icon: BoxesIcon, ready: true, adminOnly: true },
      { href: "/admin/sheets", label: "Trang mẫu", icon: LayoutGridIcon, ready: true, adminOnly: true },
      { href: "/admin/design-styles", label: "Kiểu thiết kế", icon: PaletteIcon, ready: true, adminOnly: true },
      { href: "/admin/prompts", label: "Prompt", icon: ScrollTextIcon, ready: true, adminOnly: true },
    ],
  },
  {
    id: "system",
    label: "Hệ thống",
    items: [
      { href: "/admin/users", label: "Người dùng", icon: UsersIcon, ready: true, adminOnly: true },
      { href: "/admin/settings", label: "Cấu hình", icon: SettingsIcon, ready: true, adminOnly: true },
      { href: "/admin/usage", label: "Thống kê", icon: BarChart3Icon, ready: true, adminOnly: true },
    ],
  },
];

/** Các nhóm (và mục) mà người xem được thấy; nhóm rỗng bị bỏ. */
export function visibleNav(role: "ADMIN" | "SALE"): NavGroup[] {
  return navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => role === "ADMIN" || !i.adminOnly) }))
    .filter((g) => g.items.length > 0);
}

/** Mục menu đang được chọn theo đường dẫn: khớp dài nhất thắng (để /admin/zalo không bị /zalo nuốt). */
export function activeHref(pathname: string, groups: NavGroup[]): string | null {
  let best: string | null = null;
  for (const g of groups) {
    for (const i of g.items) {
      const hit = i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(i.href + "/");
      if (hit && (best === null || i.href.length > best.length)) best = i.href;
    }
  }
  return best;
}
