/**
 * Cấu hình PM2 để chạy web (không dùng Docker). Dùng:  pm2 start deploy/ecosystem.config.cjs
 * Các biến (DATABASE_URL, APP_URL, khóa kie.ai, token Zalo...) đọc từ file .env ở thư mục dự án, Next tự nạp khi chạy.
 *
 * QUAN TRỌNG: chỉ chạy MỘT tiến trình (không dùng chế độ cluster, không tăng instances). Tiến trình giữ kết nối nghe tin của
 * các tài khoản Zalo cá nhân, theo dõi việc bot đang làm và hỏi kie.ai kết quả ảnh; chạy hai bản sẽ gửi trùng và tranh nhau.
 *
 * Cổng mặc định 3000, chỉ mở trên 127.0.0.1 (nginx hoặc Caddy đứng trước lo HTTPS). Cổng 3000 đã có ứng dụng khác dùng thì
 * đặt cổng khác:  APP_PORT=3100 pm2 start deploy/ecosystem.config.cjs   (và sửa cổng trong cấu hình nginx).
 */
const path = require("node:path");
const port = process.env.APP_PORT || "3000";

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
