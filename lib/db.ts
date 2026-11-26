import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Thiếu DATABASE_URL trong .env");
  return new PrismaClient({ adapter: new PrismaMariaDb(url) });
}

/**
 * Khi dev, client được giữ trên globalThis để nạp lại mã (HMR) không mở thêm kết nối. Nhưng sau khi đổi schema và chạy
 * `prisma generate`, lớp PrismaClient được nạp lại là lớp MỚI trong khi client cũ trên globalThis vẫn chỉ biết cấu trúc cũ:
 * mọi thao tác dùng cột/bảng mới sẽ lỗi "Unknown argument ..." cho tới khi khởi động lại máy chủ dev (đã gặp ba lần).
 * Vì vậy chỉ dùng lại client cũ khi nó đúng là sản phẩm của lớp PrismaClient hiện tại; không thì đóng nó và tạo client mới.
 */
function reusable(client: PrismaClient | undefined): client is PrismaClient {
  return !!client && client instanceof PrismaClient;
}

const existing = globalForPrisma.prisma;
if (existing && !reusable(existing)) void (existing as PrismaClient).$disconnect().catch(() => {});

export const db = reusable(existing) ? existing : createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
