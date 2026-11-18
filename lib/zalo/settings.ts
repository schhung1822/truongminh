import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";

/**
 * Cấu hình các chức năng Zalo, lưu trong bảng settings với khóa "zalo.<tên>".
 * Mỗi chức năng có công tắc bật/tắt riêng. Token bot và chuỗi bí mật webhook vẫn nằm trong .env (không lưu CSDL).
 */
export const zaloSettingsSchema = z.object({
  /** Công tắc tổng: tắt thì không gửi, không nhận, không trả lời gì qua Zalo. */
  enabled: z.boolean(),
  /** Gửi ảnh mẫu vào nhóm Zalo (tự động hoặc bấm nút). */
  groupSend: z.boolean(),
  /** Hộp thư: lưu tin khách nhắn bot, xem và trả lời ngay trên web. */
  inbox: z.boolean(),
  /** Nhân viên gõ /ghepnoi để ghép tài khoản Zalo, admin bấm Cho phép. */
  pairing: z.boolean(),
  /** Lệnh gõ nhanh cho tài khoản đã ghép nối (/help, /status...). */
  commands: z.boolean(),
  /** Bot AI (kie.ai) tự trả lời khách. */
  chatbot: z.boolean(),
  /** Bot được phép trả lời trong nhóm (khi có người @bot hoặc trả lời tin bot). */
  groupReply: z.boolean(),
  /** Bot nhìn được ảnh khách gửi (cần model AI hỗ trợ ảnh). */
  vision: z.boolean(),
  /** Nút "AI soạn" gợi ý câu trả lời trong Hộp thư. */
  aiDraft: z.boolean(),
  /** Nhân viên trả lời từ web thì bot tạm dừng ở hội thoại đó (tiếp quản). */
  takeoverOnReply: z.boolean(),

  /** Model chat của kie.ai, ví dụ gpt-5-2. */
  chatModel: z.string().trim().min(1, "Vui lòng nhập tên model chat.").max(100),
  /** Dặn dò vai trò, giọng điệu của bot. */
  botPrompt: z.string().trim().min(1, "Hướng dẫn cho bot không được để trống.").max(6000),
  /** Thông tin xưởng bot được phép nói: giá, thời gian làm, địa chỉ, chính sách... */
  botKnowledge: z.string().trim().max(12000),
  /** Cho bot biết danh sách chất liệu đang bật (tên, nhóm, công nghệ, mô tả). */
  includeMaterials: z.boolean(),
  /** Câu bot trả khi khách gửi tin thoại hoặc file (bot chưa đọc được). */
  unsupportedReply: z.string().trim().min(1).max(500),
  /** Câu bot trả khi chuyển cho nhân viên. */
  handoffReply: z.string().trim().min(1).max(500),
  /** Tối đa số lượt bot trả lời mỗi ngày (cả hệ thống), để không tốn token ngoài ý muốn. 0 = không trả lời. */
  botDailyLimit: z.coerce.number().int("Phải là số nguyên.").min(0).max(100000),
  /** Tối đa số lượt bot trả lời mỗi giờ cho một người, chống nhắn dồn dập. */
  botHourlyLimitPerContact: z.coerce.number().int("Phải là số nguyên.").min(1).max(1000),
  /** Số tin gần nhất bot đọc làm ngữ cảnh. */
  contextMessages: z.coerce.number().int("Phải là số nguyên.").min(1).max(40),

  /** Kịch bản chăm sóc nhóm: AI lên kịch bản đăng 2-3 lượt mỗi ngày, người dùng chỉnh rồi đăng. */
  care: z.boolean(),
  /** Cho AI biết dự báo thời tiết của địa điểm bên dưới (lấy từ Open-Meteo, miễn phí, chỉ gửi tọa độ) để chọn nội dung hợp thời tiết. */
  careWeather: z.boolean(),
  /** Tự động lên kịch bản và đăng đúng giờ khi có máy chủ gọi /api/jobs/zalo-care (chỉ dùng trên VPS). */
  careAutoRun: z.boolean(),
  careLocationName: z.string().trim().min(1, "Vui lòng nhập tên địa điểm.").max(100),
  careLatitude: z.coerce.number().min(-90, "Vĩ độ từ -90 đến 90.").max(90, "Vĩ độ từ -90 đến 90."),
  careLongitude: z.coerce.number().min(-180, "Kinh độ từ -180 đến 180.").max(180, "Kinh độ từ -180 đến 180."),
  /** Lên kịch bản trước bao nhiêu ngày. */
  careHorizonDays: z.coerce.number().int("Phải là số nguyên.").min(1).max(3),
});

export type ZaloSettings = z.infer<typeof zaloSettingsSchema>;

export const ZALO_SETTING_DEFAULTS: ZaloSettings = {
  enabled: true,
  groupSend: true,
  inbox: true,
  pairing: true,
  commands: true,
  chatbot: false,
  groupReply: false,
  vision: false,
  aiDraft: true,
  takeoverOnReply: true,
  chatModel: "gpt-5-2",
  botPrompt:
    "Bạn là trợ lý tư vấn của xưởng in logo lên nhiều chất liệu (in UV, in khắc). Xưng em, gọi khách là anh/chị. " +
    "Trả lời ngắn gọn, lịch sự, bằng tiếng Việt, tối đa vài câu. Chỉ dựa vào thông tin được cung cấp bên dưới; " +
    "không bịa giá, thời gian hay chính sách. Muốn xem ảnh mẫu logo của mình trên chất liệu thì bảo khách để lại tên thương hiệu và logo, nhân viên sẽ gửi ảnh mẫu.",
  botKnowledge: "",
  includeMaterials: true,
  unsupportedReply: "Em chưa đọc được loại tin này. Anh/chị nhắn chữ giúp em nhé, hoặc em sẽ nhờ nhân viên hỗ trợ ngay.",
  handoffReply: "Dạ em đã báo nhân viên, anh/chị chờ chút để được hỗ trợ trực tiếp nhé.",
  botDailyLimit: 300,
  botHourlyLimitPerContact: 20,
  contextMessages: 12,
  care: false,
  careWeather: true,
  careAutoRun: false,
  careLocationName: "Hà Nội",
  careLatitude: 21.0285,
  careLongitude: 105.8542,
  careHorizonDays: 2,
};

const KEY_PREFIX = "zalo.";

/** Đọc cấu hình Zalo; giá trị thiếu hoặc sai thì dùng mặc định. */
export async function getZaloSettings(): Promise<ZaloSettings> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: KEY_PREFIX } } });
  const merged: Record<string, unknown> = { ...ZALO_SETTING_DEFAULTS };
  for (const row of rows) {
    const name = row.key.slice(KEY_PREFIX.length);
    if (name in ZALO_SETTING_DEFAULTS) {
      const field = zaloSettingsSchema.shape[name as keyof ZaloSettings];
      if (field.safeParse(row.value).success) merged[name] = row.value;
    }
  }
  return merged as ZaloSettings;
}

export async function saveZaloSettings(values: ZaloSettings): Promise<void> {
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

/** Zalo chạy được = có token bot trong .env VÀ công tắc tổng đang bật. */
export function zaloTokenConfigured(): boolean {
  return !!getEnv().ZALO_BOT_TOKEN;
}

/** Gửi ảnh vào nhóm Zalo dùng được = có token bot + công tắc tổng + công tắc "gửi nhóm" đều bật. */
export async function groupSendEnabled(): Promise<boolean> {
  if (!zaloTokenConfigured()) return false;
  const s = await getZaloSettings();
  return s.enabled && s.groupSend;
}
