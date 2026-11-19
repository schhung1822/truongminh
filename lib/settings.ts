import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { ASPECT_RATIOS, RESOLUTIONS } from "@/lib/image-options";
import { LABEL_POSITIONS, LABEL_STYLES } from "@/lib/imaging/label-pos";

export const settingsSchema = z.object({
  imageModel: z.string().trim().min(1, "Vui lòng nhập tên model.").max(100),
  defaultResolution: z.enum(RESOLUTIONS),
  dailyLimitPerSale: z.coerce.number().int("Phải là số nguyên.").min(0).max(100000),
  workshopName: z.string().trim().max(100),
  footerNote: z.string().trim().max(200),
  /** dòng ghi chú ngay dưới tên xưởng ở chân ảnh */
  footerDisclaimer: z.string().trim().max(100),
  labelMode: z.enum(LABEL_STYLES.filter((x) => x !== "none") as ["overlay", "compact", "legend"]),
  /** vị trí thẻ nhãn mặc định của ảnh mới (mỗi ảnh có thể chọn lại sau khi tạo) */
  labelPos: z.enum(LABEL_POSITIONS),
  /** ảnh thiết kế (bước 2) là ảnh đơn nên có tỉ lệ và độ phân giải riêng */
  designAspectRatio: z.enum(ASPECT_RATIOS),
  designResolution: z.enum(RESOLUTIONS),
});

export type Settings = z.infer<typeof settingsSchema>;

export const SETTING_DEFAULTS: Settings = {
  imageModel: "gpt-image-2-5-sunburst-image-to-image",
  defaultResolution: "2K",
  dailyLimitPerSale: 60,
  workshopName: "Xưởng in Trường Minh",
  footerNote: "",
  footerDisclaimer: "Hình minh họa",
  labelMode: "overlay",
  labelPos: "br",
  designAspectRatio: "1:1",
  designResolution: "2K",
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
