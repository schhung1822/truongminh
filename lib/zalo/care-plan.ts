import { z } from "zod";
import { addDays } from "@/lib/stats/range";
import { zonedStartOfDay } from "@/lib/time";

/** Phần thuần (có test) của kịch bản chăm sóc nhóm: ngày lễ, dựng prompt cho AI, đọc và kiểm tra kết quả AI trả về. */

/* ---------- Ngày lễ ---------- */

type Holiday = { date: string; name: string };

/** Ngày lễ cố định theo dương lịch (MM-DD) áp dụng mọi năm. */
const FIXED: { md: string; name: string }[] = [
  { md: "01-01", name: "Tết Dương lịch" },
  { md: "02-14", name: "Valentine" },
  { md: "03-08", name: "Quốc tế Phụ nữ 8/3" },
  { md: "04-30", name: "Giải phóng miền Nam 30/4" },
  { md: "05-01", name: "Quốc tế Lao động 1/5" },
  { md: "06-01", name: "Quốc tế Thiếu nhi 1/6" },
  { md: "09-02", name: "Quốc khánh 2/9" },
  { md: "10-20", name: "Ngày Phụ nữ Việt Nam 20/10" },
  { md: "10-31", name: "Halloween" },
  { md: "11-11", name: "Ngày độc thân 11/11" },
  { md: "11-20", name: "Ngày Nhà giáo Việt Nam 20/11" },
  { md: "12-12", name: "Sale 12/12" },
  { md: "12-24", name: "Đêm Giáng sinh" },
  { md: "12-25", name: "Giáng sinh" },
];

/** Ngày lễ theo âm lịch đã quy đổi sẵn (cần bổ sung khi hết năm). */
const LUNAR: Holiday[] = [
  { date: "2027-02-06", name: "Tết Nguyên đán (mùng 1)" },
  { date: "2027-02-20", name: "Rằm tháng Giêng" },
  { date: "2027-04-16", name: "Giỗ Tổ Hùng Vương" },
  { date: "2027-09-15", name: "Tết Trung thu" },
  { date: "2028-01-26", name: "Tết Nguyên đán (mùng 1)" },
  { date: "2028-04-04", name: "Giỗ Tổ Hùng Vương" },
  { date: "2028-10-03", name: "Tết Trung thu" },
];

/** Thứ Sáu thứ tư của tháng 11 (Black Friday). */
function blackFriday(year: number): string {
  const first = new Date(Date.UTC(year, 10, 1)).getUTCDay(); // 0 = Chủ nhật
  const firstFriday = 1 + ((5 - first + 7) % 7);
  return `${year}-11-${String(firstFriday + 21).padStart(2, "0")}`;
}

/** Các ngày lễ trong `days` ngày tới tính từ `from` (YYYY-MM-DD), kèm số ngày còn lại. */
export function upcomingHolidays(from: string, days: number): { date: string; name: string; inDays: number }[] {
  const end = addDays(from, days);
  const year = Number(from.slice(0, 4));
  const all: Holiday[] = [
    ...[year, year + 1].flatMap((y) => FIXED.map((f) => ({ date: `${y}-${f.md}`, name: f.name }))),
    ...[year, year + 1].map((y) => ({ date: blackFriday(y), name: "Black Friday" })),
    ...LUNAR,
  ];
  const ms = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return all
    .filter((h) => h.date >= from && h.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((h) => ({ ...h, inDays: Math.round((ms(h.date) - ms(from)) / 86400_000) }));
}

/* ---------- Thời tiết (Open-Meteo) ---------- */

export type WeatherDay = { date: string; tMax: number; tMin: number; rainProb: number };

/** Rút gọn phản hồi dự báo hằng ngày của Open-Meteo thành các dòng chữ cho AI. */
export function summarizeWeather(
  daily: { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: (number | null)[] } | undefined,
): WeatherDay[] {
  if (!daily?.time) return [];
  return daily.time.map((date, i) => ({
    date,
    tMax: Math.round(daily.temperature_2m_max?.[i] ?? 0),
    tMin: Math.round(daily.temperature_2m_min?.[i] ?? 0),
    rainProb: Math.round(daily.precipitation_probability_max?.[i] ?? 0),
  }));
}

/* ---------- Giờ theo múi giờ ---------- */

/** Ngày + giờ địa phương -> thời điểm UTC. Sai định dạng thì null. */
export function zonedDateTime(day: string, hhmm: string, tz: string): Date | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  const start = zonedStartOfDay(day, tz);
  if (!m || !start) return null;
  return new Date(start.getTime() + (Number(m[1]) * 60 + Number(m[2])) * 60_000);
}

/* ---------- Dựng prompt ---------- */

export type MediaChoice = { code: string; kind: "IMAGE" | "VIDEO"; label: string };

export type PlanPromptInput = {
  now: string; // mô tả ngày giờ hiện tại, ví dụ "Thứ Tư 18/11/2026 15:40"
  days: string[]; // các ngày cần lên kịch bản (YYYY-MM-DD)
  postsPerDay: number;
  groupName: string;
  insight: string;
  workshopName: string;
  location: string;
  weather: WeatherDay[];
  holidays: { date: string; name: string; inDays: number }[];
  recentPosts: string[]; // nội dung đã đăng gần đây, để không lặp
  recentGroupMessages: string[]; // tin gần đây trong nhóm (nếu có)
  /** khối chất liệu đã định dạng (getMaterialsText, vai CARE_PLANNER) */
  materials: string;
  media: MediaChoice[];
  /** khối kiến thức CÔNG KHAI đã chọn cho vai CARE_PLANNER (getKnowledgeForAI) */
  knowledge: string;
};

export const PLAN_MARKER = "[[KICH_BAN_CHAM_SOC]]";

export function buildPlanPrompt(i: PlanPromptInput): { system: string; user: string } {
  const sys: string[] = [
    `${PLAN_MARKER} Bạn là chuyên viên chăm sóc khách hàng của ${i.workshopName}. Nhiệm vụ: lên KỊCH BẢN đăng bài vào nhóm Zalo khách hàng.`,
    "",
    "NGUYÊN TẮC:",
    `- Mỗi ngày đăng ${i.postsPerDay} lượt, chọn khung giờ dễ thu hút nhất với nhóm này (thường 7:30-9:00 sáng, 11:30-13:00 trưa, 19:00-21:30 tối; điều chỉnh theo insight nhóm). Các lượt trong cùng ngày cách nhau ít nhất 3 tiếng, trong khoảng 07:00 đến 21:30.`,
    "- Xen kẽ các dạng: TEXT (chỉ chữ), IMAGE (kèm ảnh, ví dụ mẫu mã mới), VIDEO (kèm video). Chỉ dùng IMAGE/VIDEO khi trong danh sách tư liệu có ảnh/video phù hợp, và ghi mã tư liệu vào \"media\". Không có tư liệu phù hợp thì dùng TEXT.",
    "- Nội dung gắn với hoàn cảnh thực tế: thời tiết, dịp lễ sắp tới, mùa vụ, nhu cầu của nhóm. Viết tự nhiên như người thật, thân thiện, tối đa khoảng 600 ký tự, có thể dùng vài emoji, KHÔNG dùng Markdown.",
    "- Không bịa giá, khuyến mãi, cam kết hay số liệu. Chỉ nói những gì có trong thông tin xưởng và danh sách chất liệu. Cuối bài có thể mời khách nhắn xưởng để được tư vấn.",
    "- Không lặp lại nội dung đã đăng gần đây. Mỗi bài một ý chính, đa dạng chủ đề (mẹo, mẫu mới, nhắc dịp lễ, chăm sóc khách...).",
    "- Chỉ trả về MỘT khối JSON đúng định dạng dưới đây, không giải thích thêm:",
    '{"posts":[{"date":"YYYY-MM-DD","time":"HH:MM","kind":"TEXT|IMAGE|VIDEO","text":"nội dung bài","media":"mã tư liệu hoặc null","reason":"một câu ngắn vì sao chọn bài này vào giờ này"}]}',
  ];
  sys.push("", i.knowledge.trim() || "KIẾN THỨC CỦA XƯỞNG: chưa có dữ liệu. Chỉ viết những ý chung, không nêu giá, khuyến mãi hay cam kết nào.");

  const user: string[] = [
    `Bây giờ là: ${i.now}.`,
    `Nhóm: ${i.groupName}`,
    `Insight về nhóm: ${i.insight.trim() || "(chưa có mô tả, hãy viết chung cho khách hàng của xưởng)"}`,
    `NGÀY CẦN LÊN KỊCH BẢN: ${i.days.join(", ")}`,
    `Địa điểm: ${i.location}`,
  ];
  user.push(
    i.weather.length
      ? "Dự báo thời tiết:\n" + i.weather.map((w) => `- ${w.date}: ${w.tMin}-${w.tMax}°C, khả năng mưa ${w.rainProb}%`).join("\n")
      : "Dự báo thời tiết: không có, hãy dựa vào mùa trong năm.",
  );
  user.push(
    i.holidays.length
      ? "Ngày lễ sắp tới:\n" + i.holidays.map((h) => `- ${h.date} (${h.inDays === 0 ? "hôm nay" : `còn ${h.inDays} ngày`}): ${h.name}`).join("\n")
      : "Ngày lễ sắp tới: không có trong vài ngày tới.",
  );
  if (i.materials.trim()) user.push(i.materials.trim());
  user.push(
    i.media.length
      ? "Tư liệu có thể đính kèm:\n" + i.media.map((m) => `- ${m.code} (${m.kind === "VIDEO" ? "video" : "ảnh"}): ${m.label}`).join("\n")
      : "Tư liệu có thể đính kèm: không có, chỉ dùng TEXT.",
  );
  if (i.recentPosts.length) user.push("Đã đăng gần đây (đừng lặp):\n" + i.recentPosts.map((p) => `- ${p.replace(/\s+/g, " ").slice(0, 140)}`).join("\n"));
  if (i.recentGroupMessages.length) user.push("Tin nhắn gần đây trong nhóm (để hiểu mối quan tâm):\n" + i.recentGroupMessages.map((p) => `- ${p.replace(/\s+/g, " ").slice(0, 140)}`).join("\n"));

  return { system: sys.join("\n"), user: user.join("\n\n") };
}

/* ---------- Đọc kết quả AI ---------- */

const itemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string(),
  kind: z.enum(["TEXT", "IMAGE", "VIDEO"]),
  text: z.string().trim().min(1).max(2000),
  media: z.string().nullable().optional(),
  reason: z.string().optional(),
});

export type PlannedPost = {
  scheduledAt: Date;
  kind: "TEXT" | "IMAGE" | "VIDEO";
  text: string;
  mediaCode: string | null;
  reason: string | null;
};

/** Lấy khối JSON trong câu trả lời (có thể nằm trong ```json ... ``` hoặc kèm chữ thừa). */
export function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI không trả về dữ liệu kịch bản.");
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * Kiểm tra và làm sạch kịch bản AI trả về: bỏ bài sai ngày/giờ, giới hạn số bài mỗi ngày, bài có ảnh/video mà
 * tư liệu không tồn tại thì chuyển thành TEXT, bỏ bài đã qua giờ.
 */
export function parsePlan(
  raw: string,
  opts: { days: string[]; postsPerDay: number; mediaCodes: Map<string, "IMAGE" | "VIDEO">; now: Date; tz: string },
): PlannedPost[] {
  const data = extractJson(raw) as { posts?: unknown };
  const list = Array.isArray(data?.posts) ? data.posts : [];
  const allowed = new Set(opts.days);
  const perDay = new Map<string, number>();
  const out: PlannedPost[] = [];

  for (const entry of list) {
    const p = itemSchema.safeParse(entry);
    if (!p.success || !allowed.has(p.data.date)) continue;
    const at = zonedDateTime(p.data.date, p.data.time, opts.tz);
    if (!at || at.getTime() < opts.now.getTime() + 5 * 60_000) continue;
    if ((perDay.get(p.data.date) ?? 0) >= opts.postsPerDay) continue;

    let kind = p.data.kind;
    let mediaCode = p.data.media && opts.mediaCodes.has(p.data.media) ? p.data.media : null;
    if (mediaCode && opts.mediaCodes.get(mediaCode) !== kind) {
      // AI chọn sai loại (ví dụ ghi VIDEO nhưng mã là ảnh): theo loại thật của tư liệu
      kind = opts.mediaCodes.get(mediaCode)!;
    }
    if (kind !== "TEXT" && !mediaCode) kind = "TEXT";
    if (kind === "TEXT") mediaCode = null;

    perDay.set(p.data.date, (perDay.get(p.data.date) ?? 0) + 1);
    out.push({ scheduledAt: at, kind, text: p.data.text, mediaCode, reason: p.data.reason?.trim().slice(0, 300) || null });
  }
  return out.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}
