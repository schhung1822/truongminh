import "server-only";
import { getEnv } from "@/lib/env";
import { KieProvider } from "./kie";
import { MockProvider } from "./mock";
import type { ImageProvider } from "./types";

let instance: ImageProvider | undefined;

/** Chọn nhà cung cấp theo biến môi trường IMAGE_PROVIDER ("mock" hoặc "kie"). */
export function getProvider(): ImageProvider {
  if (instance) return instance;
  const env = getEnv();
  instance =
    env.IMAGE_PROVIDER === "kie"
      ? new KieProvider(env.KIE_API_KEY!, env.KIE_API_BASE, env.KIE_UPLOAD_BASE)
      : new MockProvider();
  return instance;
}

let creditsCache: { value: number; at: number } | undefined;
const CREDITS_CACHE_MS = 20_000; // thanh đầu trang tải lại thường xuyên, không cần hỏi kie.ai mỗi lần

/** Số dư credits của kie.ai, hoặc null nếu đang dùng ảnh giả / không hỏi được. Không tốn credits. */
export async function getKieCredits(opts?: { fresh?: boolean }): Promise<number | null> {
  const p = getProvider();
  if (!(p instanceof KieProvider)) return null;
  if (!opts?.fresh && creditsCache && Date.now() - creditsCache.at < CREDITS_CACHE_MS) return creditsCache.value;
  try {
    const value = await p.getCredits();
    creditsCache = { value, at: Date.now() };
    return value;
  } catch {
    return creditsCache?.value ?? null;
  }
}
