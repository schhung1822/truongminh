import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";

/**
 * Cấu hình phần trả lời comment của module Lead Facebook (thiet-ke-module-lead-facebook-v1.1-luong-nha-san-xuat.md mục 6),
 * lưu trong bảng settings với khoá "fb.reply.<tên>". Tách khỏi cấu hình quét (lib/ext/config.ts) vì có công tắc và lựa chọn,
 * không chỉ là số. Fanpage mặc định không nằm ở đây mà ở cột fb_pages.isDefault.
 */
export const FALLBACKS = ["account", "skip"] as const;

export const fbReplyConfigSchema = z.object({
  /** AI phân loại xưởng thật / môi giới, tóm tắt năng lực và soạn câu mời cho luồng tìm nhà sản xuất. Tắt thì dùng mẫu câu. */
  supplierAiEnabled: z.boolean(),
  /** Một nhà sản xuất đã được chào thì không chào lại trong bấy nhiêu ngày (0 = không chặn). */
  offerCooldownDays: z.coerce.number().int("Phải là số nguyên.").min(0, "Tối thiểu 0.").max(365, "Tối đa 365."),
  /** Nhóm chưa có fanpage tham gia: "account" = soạn câu trả lời bằng nick, "skip" = không soạn (vẫn tạo lead). */
  fallbackWhenPageUnavailable: z.enum(FALLBACKS, "Lựa chọn không hợp lệ."),
  /** Bài tìm khách: soạn sẵn câu dẫn về inbox fanpage cho comment "ib", "quan tâm", câu hỏi (v1.0 mục 6.2). */
  replyInterestEnabled: z.boolean(),
});

export type FbReplyConfig = z.infer<typeof fbReplyConfigSchema>;

export const FB_REPLY_CONFIG_DEFAULTS: FbReplyConfig = {
  supplierAiEnabled: true,
  offerCooldownDays: 30,
  fallbackWhenPageUnavailable: "account",
  replyInterestEnabled: false,
};

const KEY_PREFIX = "fb.reply.";

export async function getFbReplyConfig(): Promise<FbReplyConfig> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: KEY_PREFIX } } });
  const merged: Record<string, unknown> = { ...FB_REPLY_CONFIG_DEFAULTS };
  for (const row of rows) {
    const name = row.key.slice(KEY_PREFIX.length);
    if (name in FB_REPLY_CONFIG_DEFAULTS) {
      const field = fbReplyConfigSchema.shape[name as keyof FbReplyConfig];
      if (field.safeParse(row.value).success) merged[name] = row.value;
    }
  }
  return merged as FbReplyConfig;
}

export async function saveFbReplyConfig(values: FbReplyConfig): Promise<void> {
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
