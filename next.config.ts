import type { NextConfig } from "next";

/**
 * Cho phép next/image tải ảnh từ địa chỉ công khai của R2. Lấy từ R2_PUBLIC_URL trong .env, nên đổi sang tên miền riêng
 * (ví dụ https://img.ten-mien.com) chỉ cần sửa biến này rồi build/khởi động lại, không sửa code.
 */
function r2RemotePatterns(): NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> {
  const raw = process.env.R2_PUBLIC_URL;
  if (!raw) return [];
  try {
    const u = new URL(raw);
    const base = u.pathname.replace(/\/+$/, "");
    return [{ protocol: u.protocol === "http:" ? "http" : "https", hostname: u.hostname, port: u.port, pathname: `${base}/**` }];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: { remotePatterns: r2RemotePatterns() },
  experimental: {
    // Tải lên đi qua máy chủ (không upload thẳng từ trình duyệt). Giới hạn mặc định là 10MB (route có proxy.ts) và 1MB (Server Action);
    // nâng lên để nhận file tới 15MB (logo, ảnh chất liệu) kèm phần đóng gói của form.
    proxyClientMaxBodySize: "20mb",
    serverActions: { bodySizeLimit: "20mb" },
  },
  // Thư viện Zalo cá nhân (kết nối websocket, cookie) chạy thẳng bằng Node, không đóng gói vào bundle
  serverExternalPackages: ["zca-js"],
  // Chỉ có tác dụng khi dev: chuyển biểu tượng của Next sang góc phải để không che nút Đăng xuất.
  devIndicators: { position: "bottom-right" },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
