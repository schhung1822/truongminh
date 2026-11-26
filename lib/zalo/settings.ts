import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { isZaloConfigured } from "./index";

/**
 * Cấu hình các chức năng Zalo, lưu trong bảng settings với khóa "zalo.<tên>".
 * Mỗi chức năng có công tắc bật/tắt riêng. Token bot và chuỗi bí mật webhook vẫn nằm trong .env (không lưu CSDL).
 */
export const zaloSettingsSchema = z.object({
  /** Công tắc tổng: tắt thì không gửi, không nhận, không làm gì qua Zalo. */
  enabled: z.boolean(),
  /** Hộp thư Zalo trên web: nhân viên xem hội thoại và trả lời khách. */
  inbox: z.boolean(),
  /** Cho nhân viên bấm "AI soạn" để lấy câu trả lời nháp (duyệt rồi mới gửi). */
  aiDraft: z.boolean(),
  /** Gửi ảnh mẫu vào nhóm Zalo (khi nhân viên tag bot giao việc, hoặc gửi tay từ Hộp thư). */
  groupSend: z.boolean(),
  /** Nhân viên gõ /ghepnoi để ghép tài khoản Zalo, admin bấm Cho phép. */
  pairing: z.boolean(),
  /** Lệnh gõ nhanh cho tài khoản đã ghép nối (/help, /status...). */
  commands: z.boolean(),
  /**
   * Trợ lý nhận lệnh: nhân viên đã ghép nối (và gắn tài khoản web) tag bot trong nhóm hoặc nhắn riêng để ra lệnh làm catalog, thiết kế,
   * hoặc hỏi kỹ thuật; bot làm rồi gửi kết quả lại đúng cuộc chat. Bot KHÔNG tự trả lời khách.
   */
  agent: z.boolean(),

  /** Tên bot hiển thị trên Zalo (để nhận ra và bỏ chữ @tag). Có tên thì chỉ tin nhắc đến tên này mới là lệnh; bỏ trống thì mọi tin bot nhận được từ nhân viên đều là lệnh. */
  agentTagName: z.string().trim().max(60),
  /** Model chat của kie.ai, ví dụ gpt-5-2. */
  chatModel: z.string().trim().min(1, "Vui lòng nhập tên model chat.").max(100),
  /** Lệnh gõ nhanh nào đang dùng được (ghép nối /ghepnoi bật riêng ở công tắc Ghép nối). */
  enabledCommands: z.array(z.enum(["help", "status", "today", "reset"])),
  /** Số tin gần nhất AI đọc làm ngữ cảnh khi soạn nháp. */
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
  inbox: false, // tạm ẩn Hộp thư Zalo (D117); bật lại bằng công tắc ở Hệ thống > Cấu hình hoặc Cài đặt Zalo > Trợ lý AI
  aiDraft: true,
  groupSend: true,
  pairing: true,
  commands: true,
  agent: false,
  agentTagName: "",
  chatModel: "gpt-5-2",
  enabledCommands: ["help", "status", "today", "reset"],
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

/** Gửi ảnh vào nhóm Zalo dùng được = có ít nhất một bot đã kết nối + công tắc tổng + công tắc "gửi nhóm" đều bật. */
export async function groupSendEnabled(): Promise<boolean> {
  if (!(await isZaloConfigured())) return false;
  const s = await getZaloSettings();
  return s.enabled && s.groupSend;
}
