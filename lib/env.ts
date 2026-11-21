import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "Thiếu DATABASE_URL"),
  APP_URL: z.url("APP_URL phải là địa chỉ web đầy đủ, ví dụ http://localhost:3000"),
  APP_TIMEZONE: z.string().default("Asia/Ho_Chi_Minh"),
  // "local" = thư mục trên máy chủ; "r2" = Cloudflare R2 (S3-compatible, một bucket public). Xem docs/DECISIONS.md D89.
  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
  // Với "r2" thư mục này vẫn dùng cho file khóa nhỏ (.secret-key của tài khoản Zalo cá nhân), không còn chứa ảnh.
  STORAGE_DIR: z.string().default("./storage"),
  // Cloudflare R2. R2_BUCKET_PUBLIC là tên cũ của biến này, vẫn nhận.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_BUCKET_PUBLIC: z.string().optional(),
  // Địa chỉ công khai của bucket (https://pub-xxxx.r2.dev hoặc tên miền riêng). Đổi sang tên miền riêng chỉ cần sửa biến này.
  R2_PUBLIC_URL: z.url("R2_PUBLIC_URL phải là địa chỉ đầy đủ, ví dụ https://pub-xxxx.r2.dev").optional(),
  IMAGE_PROVIDER: z.enum(["mock", "kie"]).default("mock"),
  KIE_API_KEY: z.string().optional(),
  KIE_API_BASE: z.url().default("https://api.kie.ai"),
  KIE_UPLOAD_BASE: z.url().default("https://kieai.redpandaai.co"),
  KIE_CALLBACK_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  KIE_CALLBACK_SECRET: z.string().optional(),
  // Bot Zalo (gửi ảnh vào nhóm). Bỏ trống ZALO_BOT_TOKEN = tắt tính năng.
  ZALO_BOT_TOKEN: z.string().optional(),
  ZALO_API_BASE: z.url().default("https://bot-api.zaloplatforms.com"),
  // Chuỗi bí mật (8-256 ký tự) Zalo gửi kèm mỗi webhook trong header X-Bot-Api-Secret-Token.
  ZALO_WEBHOOK_SECRET: z.string().min(8).max(256).optional(),
  // Khóa mã hóa cookie đăng nhập các tài khoản Zalo cá nhân (>= 16 ký tự). Bỏ trống = tự sinh file khóa trong STORAGE_DIR.
  ZALO_ACCOUNT_KEY: z.string().min(16).optional(),
  // Khóa để máy chủ (cron) gọi /api/jobs/zalo-care chạy kịch bản chăm sóc tự động. Bỏ trống = tắt đường gọi này.
  ZALO_CARE_CRON_SECRET: z.string().min(16).max(256).optional(),
  // Khóa để máy chủ (cron) gọi /api/jobs/fb-retention dọn dữ liệu cũ của module Lead Facebook. Bỏ trống = tắt đường gọi này.
  FB_CRON_SECRET: z.string().min(16).max(256).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Đọc và kiểm tra biến môi trường (lười: chỉ chạy khi có người dùng tới, không làm hỏng lúc build). */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `- ${i.path.join(".") || "(chung)"}: ${i.message}`,
    );
    throw new Error(
      `Cấu hình môi trường (.env) chưa đúng:\n${lines.join("\n")}\nXem file .env.example để biết cách điền.`,
    );
  }
  const env = parsed.data;
  if (env.IMAGE_PROVIDER === "kie" && !env.KIE_API_KEY) {
    throw new Error('IMAGE_PROVIDER="kie" nhưng chưa có KIE_API_KEY trong .env');
  }
  if (env.KIE_CALLBACK_ENABLED) {
    if (!env.KIE_CALLBACK_SECRET) throw new Error("KIE_CALLBACK_ENABLED=true nhưng chưa có KIE_CALLBACK_SECRET (lấy webhookHmacKey ở kie.ai/settings).");
    if (!env.APP_URL.startsWith("https://")) throw new Error("Callback của kie.ai cần APP_URL là địa chỉ https công khai.");
  }
  if (env.STORAGE_DRIVER === "r2") {
    const missing = (
      [
        ["R2_ACCOUNT_ID", env.R2_ACCOUNT_ID],
        ["R2_ACCESS_KEY_ID", env.R2_ACCESS_KEY_ID],
        ["R2_SECRET_ACCESS_KEY", env.R2_SECRET_ACCESS_KEY],
        ["R2_BUCKET", env.R2_BUCKET || env.R2_BUCKET_PUBLIC],
        ["R2_PUBLIC_URL", env.R2_PUBLIC_URL],
      ] as const
    )
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length > 0) throw new Error(`STORAGE_DRIVER="r2" nhưng thiếu trong .env: ${missing.join(", ")}`);
  }
  cached = env;
  return env;
}

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicUrl: string };

/** Thông tin kết nối R2 (đã kiểm tra đủ khi STORAGE_DRIVER="r2"); null nếu chưa cấu hình. */
export function getR2Config(env: Env = getEnv()): R2Config | null {
  const bucket = env.R2_BUCKET || env.R2_BUCKET_PUBLIC; // dòng R2_BUCKET trống thì dùng tên cũ R2_BUCKET_PUBLIC
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !bucket || !env.R2_PUBLIC_URL) return null;
  return { accountId: env.R2_ACCOUNT_ID, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, bucket, publicUrl: env.R2_PUBLIC_URL.replace(/\/+$/, "") };
}
