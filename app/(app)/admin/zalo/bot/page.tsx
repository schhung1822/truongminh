import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { getEnv } from "@/lib/env";
import { getZaloSettings } from "@/lib/zalo/settings";
import { BotSettings } from "../bot-settings";

export const metadata: Metadata = { title: "Zalo: trợ lý AI" };

export default async function ZaloBotPage() {
  await requireAdmin();
  const env = getEnv();
  const settings = await getZaloSettings();
  return <BotSettings initial={settings} tokenSet={!!env.ZALO_BOT_TOKEN} />;
}
