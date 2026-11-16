import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { RESOLUTIONS } from "@/lib/image-options";

export const settingsSchema = z.object({
  imageModel: z.string().trim().min(1, "Vui lòng nhập tên model.").max(100),
  defaultResolution: z.enum(RESOLUTIONS),
  dailyLimitPerSale: z.coerce.number().int("Phải là số nguyên.").min(0).max(100000),
  workshopName: z.string().trim().max(100),
  footerNote: z.string().trim().max(200),
  labelMode: z.enum(["overlay", "legend"]),
});

export type Settings = z.infer<typeof settingsSchema>;

export const SETTING_DEFAULTS: Settings = {
  imageModel: "gpt-image-2-5-flare-image-to-image",
  defaultResolution: "2K",
  dailyLimitPerSale: 60,
  workshopName: "Xưởng in logo",
  footerNote: "Ảnh mô phỏng, màu sắc thực tế có thể chênh lệch",
  labelMode: "overlay",
};

/** Đọc cấu hình, giá trị nào thiếu hoặc sai thì dùng mặc định. */
export async function getSettings(): Promise<Settings> {
  const rows = await db.setting.findMany();
  const merged: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    if (row.key in SETTING_DEFAULTS) {
      const field = settingsSchema.shape[row.key as keyof Settings];
      if (field.safeParse(row.value).success) merged[row.key] = row.value;
    }
  }
  return merged as Settings;
}

export async function saveSettings(values: Settings): Promise<void> {
  await db.$transaction(
    Object.entries(values).map(([key, value]) =>
      db.setting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } }),
    ),
  );
}
