/**
 * Cấu hình PM2 để chạy web (không dùng Docker). Dùng:  pm2 start deploy/ecosystem.config.cjs
 * Các biến (DATABASE_URL, APP_URL, khóa kie.ai, token Zalo...) đọc từ file .env ở thư mục dự án, Next tự nạp khi chạy.
 *
 * QUAN TRỌNG: chỉ chạy MỘT tiến trình (không dùng chế độ cluster, không tăng instances). Tiến trình giữ kết nối nghe tin của
 * các tài khoản Zalo cá nhân, theo dõi việc bot đang làm và hỏi kie.ai kết quả ảnh; chạy hai bản sẽ gửi trùng và tranh nhau.
 *
 * Cổng mặc định 3000, chỉ mở trên 127.0.0.1 (nginx hoặc Caddy đứng trước lo HTTPS). Cổng 3000 đã có ứng dụng khác dùng thì
 * thêm dòng  APP_PORT="3100"  vào file .env của dự án (và sửa cổng trong cấu hình nginx).
 */
const fs = require("node:fs");
const path = require("node:path");

/**
 * Cổng của web: biến APP_PORT lúc gõ lệnh, không có thì dòng APP_PORT trong .env của dự án, không có nữa thì 3000.
 * Phải đọc được từ .env vì deploy/update-pm2.sh nạp lại bằng `pm2 startOrReload ... --update-env`: nếu chỉ dựa vào biến lúc
 * gõ lệnh thì lần nạp lại nào không gõ APP_PORT=... web sẽ khởi động ở cổng 3000, đụng ứng dụng khác và sập (đã gặp 27/11/2026).
 */
function appPort() {
  const isPort = (v) => /^\d{2,5}$/.test(v);
  if (process.env.APP_PORT && isPort(process.env.APP_PORT)) return process.env.APP_PORT;
  try {
    const line = fs
      .readFileSync(path.resolve(__dirname, "..", ".env"), "utf8")
      .split(/\r?\n/)
      .find((l) => /^\s*APP_PORT\s*=/.test(l));
    const value = line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : "";
    if (isPort(value)) return value;
  } catch {
    // chưa có file .env: dùng cổng mặc định
  }
  return "3000";
}
const port = appPort();

module.exports = {
  apps: [
    {
      name: "truongminh",
      cwd: path.resolve(__dirname, ".."),
      script: "node_modules/next/dist/bin/next",
      // Máy có nhiều ứng dụng cần phiên bản Node khác nhau thì chỉ định Node 24 cho web này:  NODE_BIN=/đường/dẫn/node pm2 start ...
      interpreter: process.env.NODE_BIN || "node",
      args: `start -H 127.0.0.1 -p ${port}`,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      // Cho web 30 giây để gửi nốt các tác vụ sang kie.ai trước khi tắt.
      kill_timeout: 30000,
      // Khởi động lại nếu RAM phình quá mức (xử lý ảnh 2K). Việc bot đang làm dở tự được nhặt lại khi khởi động.
      max_memory_restart: "1500M",
      env: {
        NODE_ENV: "production",
        // Giữ RAM của sharp không phình khi chạy lâu.
        MALLOC_ARENA_MAX: "2",
        TZ: process.env.TZ || "Asia/Ho_Chi_Minh",
      },
    },
  ],
};
