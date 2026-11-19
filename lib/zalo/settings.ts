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
  /** Khi bot chuyển khách cho nhân viên, nhắn báo cho các nhân viên đã ghép nối (qua Zalo). */
  staffNotify: z.boolean(),
  /** Trả lời nhanh theo từ khóa (không tốn token), chạy trước bot AI. */
  quickReplies: z.boolean(),
  /** Gửi lời chào cho khách nhắn lần đầu. */
  welcome: z.boolean(),
  /** Bật giờ làm việc: ngoài giờ thì bot dùng câu "ngoài giờ" khi chuyển nhân viên. */
  hoursEnabled: z.boolean(),

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
  /** Câu bot trả khi chuyển nhân viên mà đang ngoài giờ làm việc. */
  afterHoursReply: z.string().trim().min(1, "Câu trả lời ngoài giờ không được để trống.").max(500),
  /** Lời chào khách nhắn lần đầu. */
  welcomeMessage: z.string().trim().min(1, "Lời chào không được để trống.").max(1000),
  /** Từ khóa khách gõ là chuyển nhân viên ngay (mỗi dòng một từ hoặc cụm từ). */
  handoffKeywords: z.string().trim().max(2000),
  /** Các câu trả lời nhanh theo từ khóa. */
  quickReplyList: z
    .array(
      z.object({
        keywords: z.string().trim().min(1, "Mỗi câu trả lời nhanh cần ít nhất một từ khóa.").max(300),
        reply: z.string().trim().min(1, "Mỗi câu trả lời nhanh cần nội dung trả lời.").max(1500),
      }),
    )
    .max(30, "Tối đa 30 câu trả lời nhanh."),
  /** Giờ làm việc: từ giờ, đến giờ (HH:MM, theo múi giờ APP_TIMEZONE), và các ngày trong tuần (0 = Chủ nhật). */
  hoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ bắt đầu phải dạng HH:MM, ví dụ 08:00."),
  hoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ kết thúc phải dạng HH:MM, ví dụ 17:30."),
  hoursDays: z.array(z.number().int().min(0).max(6)).min(1, "Chọn ít nhất một ngày làm việc.").max(7),
  /** Bot im ở hội thoại đã chuyển nhân viên; sau bao nhiêu giờ thì tự trả lời lại. 0 = không tự trả lại. */
  botResumeHours: z.coerce.number().int("Phải là số nguyên.").min(0).max(720),
  /** Lệnh gõ nhanh nào đang dùng được (ghép nối /ghepnoi bật riêng ở công tắc Ghép nối). */
  enabledCommands: z.array(z.enum(["help", "status", "today", "waiting", "done", "reset", "human"])),
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

  /**
   * Chữ đi kèm mỗi ảnh gửi vào nhóm. Dùng {thuong_hieu} {khach} {nhan} {sale} {link}; dòng nào chỉ có chỗ trống (ví dụ {link} khi chưa có
   * địa chỉ công khai) thì tự bỏ.
   */
  captionTemplate: z.string().trim().min(1, "Mẫu chữ đi kèm ảnh không được để trống.").max(1000),
  /** Khoảng nghỉ giữa hai ảnh gửi vào nhóm (mili giây), để không dồn dập. */
  sendGapMs: z.coerce.number().int("Phải là số nguyên.").min(200, "Tối thiểu 200 ms.").max(10000, "Tối đa 10000 ms."),
});

export type ZaloSettings = z.infer<typeof zaloSettingsSchema>;

export const ZALO_SETTING_DEFAULTS: ZaloSettings = {
  enabled: true,
  groupSend: true,
  pairing: true,
  commands: true,
  chatbot: false,
  groupReply: false,
  vision: false,
  staffNotify: true,
  quickReplies: false,
  welcome: false,
  hoursEnabled: false,
  chatModel: "gpt-5-2",
  botPrompt:
    "Bạn là trợ lý tư vấn của xưởng in logo lên nhiều chất liệu (in UV, in khắc). Xưng em, gọi khách là anh/chị. " +
    "Trả lời ngắn gọn, lịch sự, bằng tiếng Việt, tối đa vài câu. Chỉ dựa vào thông tin được cung cấp bên dưới; " +
    "không bịa giá, thời gian hay chính sách. Muốn xem ảnh mẫu logo của mình trên chất liệu thì bảo khách để lại tên thương hiệu và logo, nhân viên sẽ gửi ảnh mẫu.",
  botKnowledge: "",
  includeMaterials: true,
  unsupportedReply: "Em chưa đọc được loại tin này. Anh/chị nhắn chữ giúp em nhé, hoặc em sẽ nhờ nhân viên hỗ trợ ngay.",
  handoffReply: "Dạ em đã báo nhân viên, anh/chị chờ chút để được hỗ trợ trực tiếp nhé.",
  afterHoursReply: "Hiện xưởng đang ngoài giờ làm việc. Em đã ghi nhận, nhân viên sẽ trả lời anh/chị ngay khi vào ca nhé.",
  welcomeMessage: "Chào anh/chị ạ, em là trợ lý của xưởng. Anh/chị cần xem ảnh mẫu hay hỏi chất liệu, cứ nhắn em nhé.",
  handoffKeywords: "gặp nhân viên\ngặp người\nnói chuyện với người\nkhiếu nại\nbáo giá",
  quickReplyList: [],
  hoursStart: "08:00",
  hoursEnd: "17:30",
  hoursDays: [1, 2, 3, 4, 5, 6],
  botResumeHours: 12,
  enabledCommands: ["help", "status", "today", "waiting", "done", "reset", "human"],
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
  captionTemplate: "{thuong_hieu} · {khach}\n{nhan}\nSale: {sale}\n{link}",
  sendGapMs: 600,
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

/**
 * Cập nhật một phần cấu hình (mỗi trang cài đặt chỉ gửi phần của mình). Trộn với giá trị hiện tại, kiểm tra cả bộ rồi chỉ lưu phần được gửi.
 * Trả về thông báo lỗi đầu tiên nếu không hợp lệ.
 */
export async function updateZaloSettings(patch: Partial<ZaloSettings>): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await getZaloSettings();
  const parsed = zaloSettingsSchema.safeParse({ ...current, ...patch });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const names = Object.keys(patch).filter((k) => k in ZALO_SETTING_DEFAULTS) as (keyof ZaloSettings)[];
  await db.$transaction(
    names.map((name) =>
      db.setting.upsert({
        where: { key: KEY_PREFIX + name },
        create: { key: KEY_PREFIX + name, value: parsed.data[name] as never },
        update: { value: parsed.data[name] as never },
      }),
    ),
  );
  return { ok: true };
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
