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

/** Số dư credits của kie.ai, hoặc null nếu đang dùng ảnh giả / không hỏi được. Không tốn credits. */
export async function getKieCredits(): Promise<number | null> {
  const p = getProvider();
  if (!(p instanceof KieProvider)) return null;
  try {
    return await p.getCredits();
  } catch {
    return null;
  }
}
