import "server-only";
import { getEnv } from "@/lib/env";
import { MockProvider } from "./mock";
import type { ImageProvider } from "./types";

let instance: ImageProvider | undefined;

/** Chọn nhà cung cấp theo biến môi trường IMAGE_PROVIDER ("mock" hoặc "kie"). */
export function getProvider(): ImageProvider {
  if (instance) return instance;
  const env = getEnv();
  if (env.IMAGE_PROVIDER === "kie") {
    // KieProvider được thêm ở giai đoạn 5, sau khi đọc tài liệu hiện hành của kie.ai.
    throw new Error('IMAGE_PROVIDER="kie" chưa được hỗ trợ trong phiên bản này. Hãy đặt IMAGE_PROVIDER="mock".');
  }
  instance = new MockProvider();
  return instance;
}
