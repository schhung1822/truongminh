import { cn } from "@/lib/utils";

export type Platform = "facebook" | "pinterest" | "kie" | "zalo";

/**
 * Logo của từng nền tảng trong khu Kết nối. Ảnh hiển thị là bản thu nhỏ 96px trong public/images/platforms/, tạo từ ảnh gốc
 * chủ dự án đặt ở public/images/ (icon_fb.png, icon_pinterest.webp, logo_kieai.webp, Icon_zalo.webp). Ảnh gốc có cái tới
 * 3840px nên không dùng thẳng cho ô 40px. Đổi logo: thay ảnh gốc rồi tạo lại bản thu nhỏ cùng tên.
 */
const SRC: Record<Platform, string> = {
  facebook: "/images/platforms/facebook.webp",
  pinterest: "/images/platforms/pinterest.webp",
  kie: "/images/platforms/kie.webp",
  zalo: "/images/platforms/zalo.webp",
};

/** Logo nền tảng. Chỉ để trang trí (tên nền tảng luôn đứng ngay bên cạnh) nên alt để trống. */
export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  return <img src={SRC[platform]} alt="" width={96} height={96} className={cn("size-5 shrink-0 object-contain", className)} />;
}

/** Logo đặt trong ô vuông nền trắng có viền, dùng ở đầu thẻ. Nền trắng cố định để logo không chìm khi giao diện tối. */
export function PlatformBadge({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white p-1.5", className)}>
      <PlatformIcon platform={platform} className="size-full" />
    </span>
  );
}
