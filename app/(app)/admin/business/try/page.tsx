import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { getZaloSettings } from "@/lib/zalo/settings";
import { TryForm } from "./try-form";

export const metadata: Metadata = { title: "Thử AI" };

export default async function TryAiPage() {
  await requireAdmin();
  const { chatModel } = await getZaloSettings();
  return <TryForm model={chatModel} />;
}
