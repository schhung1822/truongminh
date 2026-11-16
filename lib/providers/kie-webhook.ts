import { createHmac, timingSafeEqual } from "node:crypto";

/** Chữ ký theo docs.kie.ai: base64(HMAC-SHA256(taskId + "." + timestampSeconds, webhookHmacKey)). */
export function computeSignature(taskId: string, timestamp: string, secret: string): string {
  return createHmac("sha256", secret).update(`${taskId}.${timestamp}`).digest("base64");
}

/** So sánh theo thời gian không đổi để tránh dò chữ ký. */
export function isValidSignature(taskId: string, timestamp: string, received: string, secret: string): boolean {
  const expected = Buffer.from(computeSignature(taskId, timestamp, secret));
  const got = Buffer.from(received);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
