import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { isZaloConfigured } from "@/lib/zalo";
import { getZaloSettings } from "@/lib/zalo/settings";
import { BotSettings } from "../bot-settings";

export const metadata: Metadata = { title: "Zalo: trợ lý AI" };

export default async function ZaloBotPage() {
  await requireAdmin();
  const [settings, configured] = await Promise.all([getZaloSettings(), isZaloConfigured()]);
  return <BotSettings initial={settings} tokenSet={configured} />;
}
