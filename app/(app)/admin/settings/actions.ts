"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/dal";
import { kieModel } from "@/lib/providers/kie-models";
import { saveSettings, settingsSchema } from "@/lib/settings";

export type SettingsResult = { error?: string; ok?: string };

export async function saveSettingsAction(_prev: SettingsResult, formData: FormData): Promise<SettingsResult> {
  await requireAdmin();
  const parsed = settingsSchema.safeParse({
    imageModel: formData.get("imageModel"),
    defaultResolution: formData.get("defaultResolution"),
    autoMaterialCount: formData.get("autoMaterialCount"),
    dailyLimitPerSale: formData.get("dailyLimitPerSale"),
    qualityDefault: formData.get("qualityDefault") === "on",
    workshopName: formData.get("workshopName") ?? "",
    footerNote: formData.get("footerNote") ?? "",
    footerDisclaimer: formData.get("footerDisclaimer") ?? "",
    labelMode: formData.get("labelMode"),
    labelPos: formData.get("labelPos"),
    designAspectRatio: formData.get("designAspectRatio"),
    designResolution: formData.get("designResolution"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const model = kieModel(parsed.data.imageModel);
  const supported = model?.sizes.map((s) => s.resolution) ?? [];
  if (model && !supported.includes(parsed.data.defaultResolution)) {
    return { error: `${model.label} không hỗ trợ độ phân giải ${parsed.data.defaultResolution} cho trang mẫu. Chọn: ${supported.join(", ")}.` };
  }
  if (model && !supported.includes(parsed.data.designResolution)) {
    return { error: `${model.label} không hỗ trợ độ phân giải ${parsed.data.designResolution} cho ảnh thiết kế. Chọn: ${supported.join(", ")}.` };
  }

  await saveSettings(parsed.data);
  revalidatePath("/admin/settings");
  return { ok: "Đã lưu cấu hình." };
}
