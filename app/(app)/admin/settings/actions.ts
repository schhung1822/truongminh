"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/dal";
import { saveSettings, settingsSchema } from "@/lib/settings";

export type SettingsResult = { error?: string; ok?: string };

export async function saveSettingsAction(_prev: SettingsResult, formData: FormData): Promise<SettingsResult> {
  await requireAdmin();
  const parsed = settingsSchema.safeParse({
    imageModel: formData.get("imageModel"),
    defaultResolution: formData.get("defaultResolution"),
    dailyLimitPerSale: formData.get("dailyLimitPerSale"),
    workshopName: formData.get("workshopName") ?? "",
    footerNote: formData.get("footerNote") ?? "",
    footerDisclaimer: formData.get("footerDisclaimer") ?? "",
    labelMode: formData.get("labelMode"),
    labelPos: formData.get("labelPos"),
    designAspectRatio: formData.get("designAspectRatio"),
    designResolution: formData.get("designResolution"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await saveSettings(parsed.data);
  revalidatePath("/admin/settings");
  return { ok: "Đã lưu cấu hình." };
}
