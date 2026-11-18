# Đóng gói web để chạy trên VPS. Dùng: docker compose up -d --build (xem README, mục "Triển khai lên VPS").
FROM node:24-bookworm-slim

# openssl: Prisma cần. fontconfig: sharp vẽ chữ cần. tzdata: múi giờ. ca-certificates: gọi HTTPS tới kie.ai.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tzdata fontconfig \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    # Giữ RAM của sharp (xử lý ảnh 2K) không phình khi chạy lâu.
    MALLOC_ARENA_MAX=2 \
    NODE_ENV=production

# Cài thư viện trước để tận dụng bộ nhớ đệm của Docker khi chỉ sửa mã.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN NODE_ENV=development npm ci

COPY . .

# Build cần vài biến giả (không kết nối CSDL lúc build). Biến thật nằm trong file .env lúc chạy.
RUN DATABASE_URL="mysql://build:build@127.0.0.1:3306/build" APP_URL="http://localhost:3000" npm run build

# Thư mục lưu ảnh: được mount ra ngoài container (xem docker-compose.yml).
RUN mkdir -p /app/storage && chown -R node:node /app/storage /app/.next
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Tự cập nhật cấu trúc CSDL (migrate) rồi mới chạy web.
CMD ["sh", "-c", "npx prisma migrate deploy && exec npx next start -H 0.0.0.0 -p 3000"]
