import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "Thiếu DATABASE_URL"),
  APP_URL: z.url("APP_URL phải là địa chỉ web đầy đủ, ví dụ http://localhost:3000"),
  APP_TIMEZONE: z.string().default("Asia/Ho_Chi_Minh"),
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_DIR: z.string().default("./storage"),
  IMAGE_PROVIDER: z.enum(["mock", "kie"]).default("mock"),
  KIE_API_KEY: z.string().optional(),
  KIE_API_BASE: z.url().default("https://api.kie.ai"),
  KIE_UPLOAD_BASE: z.url().default("https://kieai.redpandaai.co"),
  KIE_CALLBACK_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  KIE_CALLBACK_SECRET: z.string().optional(),
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
  cached = env;
  return env;
}
