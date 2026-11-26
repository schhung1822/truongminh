import type { Role } from "@/generated/prisma/enums";
import {
  BarChart3Icon,
  BookOpenIcon,
  BoxesIcon,
  BrainIcon,
  BuildingIcon,
  CalculatorIcon,
  ClipboardListIcon,
  FolderTreeIcon,
  HistoryIcon,
  HomeIcon,
  InboxIcon,
  CalendarHeartIcon,
  LayoutGridIcon,
  MessageCircleIcon,
  NewspaperIcon,
  type LucideIcon,
  PaletteIcon,
  PinIcon,
  PlugZapIcon,
  ScrollTextIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  TargetIcon,
  TrendingUpIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** false = chưa làm xong (hiện mờ, chưa bấm được). Bật dần theo từng giai đoạn. */
  ready: boolean;
  /** true = chỉ quản trị viên thấy */
  adminOnly?: boolean;
  /** Chỉ các vai trò này thấy (ghi đè adminOnly). Dùng cho mục của module Lead Facebook: quản trị + marketing. */
  roles?: Role[];
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
    id: "fb",
    label: "Lead Facebook",
    items: [
      { href: "/fb/leads", label: "Lead", icon: TargetIcon, ready: true },
      { href: "/fb/leads/stats", label: "Thống kê Lead", icon: TrendingUpIcon, ready: true, roles: ["MKT"] },
      { href: "/fb/posts", label: "Bài đăng", icon: NewspaperIcon, ready: true, roles: ["MKT"] },
      { href: "/fb/groups", label: "Nhóm", icon: UsersRoundIcon, ready: true, roles: ["MKT"] },
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
      { href: "/pinterest", label: "Mẫu Pinterest", icon: PinIcon, ready: true },
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
      // Mọi kết nối với dịch vụ ngoài (extension Facebook, Pinterest, kie.ai, Zalo) gom về đây. Marketing cũng thấy mục này
      // nhưng bên trong chỉ có phần extension của mình (app/(app)/admin/connections/layout.tsx).
      { href: "/admin/connections", label: "Kết nối", icon: PlugZapIcon, ready: true, roles: ["MKT"] },
      { href: "/admin/usage", label: "Thống kê", icon: BarChart3Icon, ready: true, adminOnly: true },
      { href: "/admin/activity", label: "Nhật ký hoạt động", icon: ClipboardListIcon, ready: true, adminOnly: true },
    ],
  },
];

/** Mục Hộp thư Zalo: ẩn khỏi menu khi công tắc "Hộp thư Zalo" ở Hệ thống > Cấu hình đang tắt (xem app/(app)/layout.tsx). */
export const ZALO_INBOX_HREF = "/zalo";

/**
 * Các nhóm (và mục) mà người xem được thấy; nhóm rỗng bị bỏ. `hidden` = đường dẫn của các mục đang bị tắt trong cấu hình,
 * ẩn với mọi vai trò kể cả quản trị viên.
 */
export function visibleNav(role: Role, hidden: readonly string[] = []): NavGroup[] {
  const canSee = (i: NavItem) => !hidden.includes(i.href) && (i.roles ? role === "ADMIN" || i.roles.includes(role) : role === "ADMIN" || !i.adminOnly);
  return navGroups.map((g) => ({ ...g, items: g.items.filter(canSee) })).filter((g) => g.items.length > 0);
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
