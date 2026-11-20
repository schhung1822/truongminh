import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { getQuoteConfig } from "@/lib/quoting/store";
import { formatDateTime } from "../format";
import { configToRaw } from "../settings-input";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Cấu hình giá" };

export default async function QuotingSettingsPage() {
  await requireAdmin();
  const state = await getQuoteConfig();
  return <SettingsForm initial={configToRaw(state.config)} configVersion={state.configVersion} updated={formatDateTime(state.updatedAt)} />;
}
