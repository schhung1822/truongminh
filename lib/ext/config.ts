import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";

/**
 * Cấu hình module Lead Facebook, lưu trong bảng settings với khoá "fb.<tên>" (giá trị thiếu hoặc sai thì dùng mặc định).
 * Ba số đầu (pollMinutes, maxPostsPerCycle, delaySecondsBetweenPosts) gửi cho extension qua /api/ext/me.
 * Độ trễ giữa các bài là số CỐ ĐỊNH, chỉ để không tạo tải bất thường lên tài khoản; không ngẫu nhiên hoá, không giả hành vi người dùng.
 */
export const fbConfigSchema = z.object({
  /** Chu kỳ extension hỏi việc (phút). Cũng là chu kỳ quét lại của bài mới đăng. */
  pollMinutes: z.coerce.number().int("Phải là số nguyên.").min(5, "Tối thiểu 5 phút.").max(240, "Tối đa 240 phút."),
  /** Số bài tối đa quét trong một chu kỳ. */
  maxPostsPerCycle: z.coerce.number().int("Phải là số nguyên.").min(1, "Tối thiểu 1.").max(30, "Tối đa 30."),
  /** Chờ giữa hai bài liền nhau (giây). Số cố định. */
  delaySecondsBetweenPosts: z.coerce.number().int("Phải là số nguyên.").min(15, "Tối thiểu 15 giây.").max(600, "Tối đa 600 giây."),
  /** Bài mới đăng trong vòng bấy nhiêu giờ thì quét dày (mỗi pollMinutes). */
  freshHours: z.coerce.number().int("Phải là số nguyên.").min(1).max(720),
  /** Bài cũ hơn mốc trên được quét lại sau bấy nhiêu phút. */
  oldIntervalMinutes: z.coerce.number().int("Phải là số nguyên.").min(10).max(10080),
  /** Bài không có comment mới sau bấy nhiêu ngày thì tự chuyển "Đã xong". */
  doneAfterDays: z.coerce.number().int("Phải là số nguyên.").min(1).max(365),
  /** Comment loại "Khác" và "Spam" tự xoá sau bấy nhiêu ngày (0 = không tự xoá). Đề xuất của tài liệu: 90. */
  retentionDays: z.coerce.number().int("Phải là số nguyên.").min(0).max(3650),
});

export type FbConfig = z.infer<typeof fbConfigSchema>;

export const FB_CONFIG_DEFAULTS: FbConfig = {
  pollMinutes: 10,
  maxPostsPerCycle: 8,
  delaySecondsBetweenPosts: 45,
  freshHours: 48,
  oldIntervalMinutes: 60,
  doneAfterDays: 7,
  retentionDays: 90,
};

const KEY_PREFIX = "fb.";

export async function getFbConfig(): Promise<FbConfig> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: KEY_PREFIX } } });
  const merged: Record<string, unknown> = { ...FB_CONFIG_DEFAULTS };
  for (const row of rows) {
    const name = row.key.slice(KEY_PREFIX.length);
    if (name in FB_CONFIG_DEFAULTS) {
      const field = fbConfigSchema.shape[name as keyof FbConfig];
      if (field.safeParse(row.value).success) merged[name] = row.value;
    }
  }
  return merged as FbConfig;
}

export async function saveFbConfig(values: FbConfig): Promise<void> {
  await db.$transaction(
    Object.entries(values).map(([name, value]) =>
      db.setting.upsert({
        where: { key: KEY_PREFIX + name },
        create: { key: KEY_PREFIX + name, value: value as never },
        update: { value: value as never },
      }),
    ),
  );
}
