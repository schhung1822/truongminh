import "server-only";
import { getEnv } from "@/lib/env";
import { ZaloClient } from "./client";

let instance: ZaloClient | undefined;

/** Client gọi Zalo Bot, hoặc null nếu chưa cấu hình ZALO_BOT_TOKEN (tính năng tắt). */
export function getZaloClient(): ZaloClient | null {
  const env = getEnv();
  if (!env.ZALO_BOT_TOKEN) return null;
  return (instance ??= new ZaloClient(env.ZALO_BOT_TOKEN, env.ZALO_API_BASE));
}

export function isZaloConfigured(): boolean {
  return !!getEnv().ZALO_BOT_TOKEN;
}
