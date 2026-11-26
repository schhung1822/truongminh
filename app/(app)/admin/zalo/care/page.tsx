import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { isZaloConfigured } from "@/lib/zalo";
import { getZaloSettings } from "@/lib/zalo/settings";
import { CareSettings } from "../care-settings";

export const metadata: Metadata = { title: "Zalo: chăm sóc nhóm" };

export default async function ZaloCareSettingsPage() {
  await requireAdmin();
  const settings = await getZaloSettings();
  return <CareSettings initial={settings} tokenSet={await isZaloConfigured()} />;
}
