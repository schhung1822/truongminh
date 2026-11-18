import "server-only";
import { ChatError, getChatProvider } from "@/lib/ai/chat";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { todayKey } from "@/lib/jobs/limits";
import { shared } from "@/lib/jobs/throttle";
import { getSettings } from "@/lib/settings";
import { addDays } from "@/lib/stats/range";
import { getStorage } from "@/lib/storage";
import { zonedStartOfDay } from "@/lib/time";
import { buildPlanPrompt, parsePlan, summarizeWeather, upcomingHolidays, type MediaChoice, type WeatherDay } from "./care-plan";
import { ZaloError } from "./client";
import { getZaloClient } from "./index";
import { getZaloSettings } from "./settings";
import { splitMessage, stripMarkdown } from "./text";

/** Kịch bản chăm sóc nhóm Zalo: AI lên kịch bản, người dùng chỉnh, bấm đăng (hoặc máy chủ tự đăng khi bật chạy tự động). */

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/* ---------- Tư liệu để đính kèm ---------- */

export type MediaOption = { code: string; kind: "IMAGE" | "VIDEO"; label: string; assetId?: string; imageId?: string };

/** Tư liệu AI được chọn: ảnh/video trong thư viện + ảnh đã tạo trong hệ thống 30 ngày gần đây (mẫu mã mới). */
export async function loadMediaOptions(): Promise<MediaOption[]> {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [assets, images] = await Promise.all([
    db.zaloAsset.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    db.generatedImage.findMany({
      where: { status: "SUCCESS", retries: { none: {} }, finalPath: { not: null }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, kind: true, layoutSnapshot: true, session: { select: { logo: { select: { brand: { select: { name: true } } } } } } },
    }),
  ]);
  const out: MediaOption[] = [];
  assets.forEach((a, i) => {
    out.push({ code: `A${i + 1}`, kind: a.kind === "VIDEO" ? "VIDEO" : "IMAGE", label: `${a.title}${a.description ? ` - ${a.description.slice(0, 120)}` : ""}`, assetId: a.id });
  });
  images.forEach((img, i) => {
    const snap = img.layoutSnapshot as { title?: string; imageNumber?: number; design?: { styleName?: string } } | null;
    const what = img.kind === "DESIGN" ? `thiết kế ${snap?.design?.styleName ?? ""}`.trim() : `catalog${snap?.imageNumber ? ` ảnh ${snap.imageNumber}` : ""}`;
    out.push({ code: `I${i + 1}`, kind: "IMAGE", label: `Mẫu của ${img.session.logo.brand.name} (${what})`, imageId: img.id });
  });
  return out;
}

/* ---------- Thời tiết ---------- */

async function fetchWeather(lat: number, lon: number, tz: string): Promise<WeatherDay[]> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=${encodeURIComponent(tz)}&forecast_days=5`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    return summarizeWeather(((await res.json()) as { daily?: Parameters<typeof summarizeWeather>[0] }).daily);
  } catch {
    return []; // không lấy được thời tiết thì AI dựa vào mùa
  }
}

/* ---------- Lên kịch bản ---------- */

export type PlanResult = { ok: true; created: number; kept: number } | { ok: false; error: string };

function nowLabel(tz: string): string {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: tz, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
}

/**
 * Nhờ AI lên kịch bản cho một nhóm. Bài đã lên sẵn mà người dùng chưa chỉnh và chưa đăng thì được thay mới;
 * bài người dùng đã chỉnh hoặc đã đăng thì giữ nguyên.
 */
export async function generateCarePlan(groupId: string, opts?: { includeToday?: boolean; days?: number }): Promise<PlanResult> {
  const s = await getZaloSettings();
  if (!s.enabled || !s.care) return { ok: false, error: "Kịch bản chăm sóc đang tắt (Quản trị > Zalo)." };
  const group = await db.zaloGroup.findUnique({ where: { id: groupId } });
  if (!group) return { ok: false, error: "Không tìm thấy nhóm." };

  const env = getEnv();
  const tz = env.APP_TIMEZONE;
  const today = todayKey();
  const horizon = Math.min(3, Math.max(1, opts?.days ?? s.careHorizonDays));
  const start = opts?.includeToday ? today : addDays(today, 1);
  const days = Array.from({ length: horizon }, (_, i) => addDays(start, i));
  const postsPerDay = Math.min(3, Math.max(2, group.postsPerDay));

  const [workshop, media, recent, weather, materials, groupChat] = await Promise.all([
    getSettings(),
    loadMediaOptions(),
    db.zaloPost.findMany({ where: { groupId, status: { in: ["SENT", "PLANNED"] } }, orderBy: { createdAt: "desc" }, take: 12, select: { text: true } }),
    s.careWeather ? fetchWeather(s.careLatitude, s.careLongitude, tz) : Promise.resolve([]),
    db.material.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, take: 60, select: { name: true } }),
    db.zaloContact.findUnique({ where: { chatId: group.chatId }, select: { id: true } }),
  ]);
  const groupMessages = groupChat
    ? await db.zaloMessage.findMany({ where: { contactId: groupChat.id, direction: "IN", kind: "TEXT" }, orderBy: { createdAt: "desc" }, take: 15, select: { text: true } })
    : [];

  const choices: MediaChoice[] = media.map((m) => ({ code: m.code, kind: m.kind, label: m.label }));
  const { system, user } = buildPlanPrompt({
    now: nowLabel(tz),
    days,
    postsPerDay,
    groupName: group.name,
    insight: group.insight ?? "",
    workshopName: workshop.workshopName,
    location: s.careLocationName,
    weather: weather.filter((w) => days.includes(w.date)),
    holidays: upcomingHolidays(today, horizon + 4),
    recentPosts: recent.map((r) => r.text),
    recentGroupMessages: groupMessages.map((m) => m.text ?? "").filter(Boolean),
    materials: materials.map((m) => m.name),
    media: choices,
    botKnowledge: s.botKnowledge,
  });

  let raw: string;
  try {
    const r = await getChatProvider().complete({
      model: s.chatModel,
      messages: [
        { role: "system", content: [{ type: "text", text: system }] },
        { role: "user", content: [{ type: "text", text: user }] },
      ],
      signal: AbortSignal.timeout(90_000),
    });
    raw = r.text;
  } catch (e) {
    return { ok: false, error: e instanceof ChatError ? e.message : errText(e) };
  }

  let planned;
  try {
    planned = parsePlan(raw, {
      days,
      postsPerDay,
      mediaCodes: new Map(media.map((m) => [m.code, m.kind])),
      now: new Date(),
      tz,
    });
  } catch (e) {
    return { ok: false, error: `AI trả về kịch bản không đọc được, hãy thử lại. (${errText(e)})` };
  }
  if (planned.length === 0) return { ok: false, error: "AI chưa tạo được bài hợp lệ nào (sai giờ hoặc sai ngày), hãy thử lại." };

  const rangeStart = zonedStartOfDay(days[0], tz)!;
  const rangeEnd = zonedStartOfDay(addDays(days[days.length - 1], 1), tz)!;
  const byCode = new Map(media.map((m) => [m.code, m]));

  const kept = await db.zaloPost.count({ where: { groupId, scheduledAt: { gte: rangeStart, lt: rangeEnd }, OR: [{ editedAt: { not: null } }, { status: { not: "PLANNED" } }] } });
  await db.$transaction([
    db.zaloPost.deleteMany({ where: { groupId, status: "PLANNED", editedAt: null, scheduledAt: { gte: rangeStart, lt: rangeEnd } } }),
    db.zaloPost.createMany({
      data: planned.map((p) => {
        const m = p.mediaCode ? byCode.get(p.mediaCode) : undefined;
        return { groupId, scheduledAt: p.scheduledAt, kind: p.kind, text: p.text, assetId: m?.assetId ?? null, imageId: m?.imageId ?? null, reason: p.reason };
      }),
    }),
  ]);
  return { ok: true, created: planned.length, kept };
}

/* ---------- Đăng ---------- */

export type PublishResult = { ok: true } | { ok: false; error: string };

/** Đăng một bài vào nhóm ngay. Bài đã đăng hoặc đang đăng thì từ chối (không đăng trùng). */
export async function publishPost(postId: string): Promise<PublishResult> {
  const client = getZaloClient();
  const s = await getZaloSettings();
  if (!client || !s.enabled || !s.care) return { ok: false, error: "Zalo hoặc kịch bản chăm sóc đang tắt." };

  const claimed = await db.zaloPost.updateMany({ where: { id: postId, status: { in: ["PLANNED", "FAILED"] } }, data: { status: "SENDING", error: null } });
  if (claimed.count === 0) return { ok: false, error: "Bài này đã đăng, đang đăng hoặc đã bị bỏ qua." };

  const post = await db.zaloPost.findUnique({ where: { id: postId }, include: { group: true, asset: true, image: true } });
  if (!post) return { ok: false, error: "Không tìm thấy bài." };

  const fail = async (error: string): Promise<PublishResult> => {
    await db.zaloPost.update({ where: { id: postId }, data: { status: "FAILED", error } });
    return { ok: false, error };
  };
  if (!post.group.isActive) return fail("Nhóm đang tắt.");

  try {
    await shared().zaloSend(async () => {
      const storage = getStorage();
      const chatId = post.group.chatId;
      const text = stripMarkdown(post.text);
      if (post.kind === "TEXT") {
        for (const chunk of splitMessage(text)) {
          await client.sendMessage(chatId, chunk);
        }
        return;
      }
      const path = post.asset?.path ?? post.image?.finalPath;
      if (!path) throw new Error("Bài này thiếu ảnh/video đính kèm. Chọn lại tư liệu rồi đăng.");
      const data = await storage.get(path);
      if (post.kind === "IMAGE") {
        await client.sendPhoto({ chatId, image: data, fileName: path.split("/").pop() ?? "anh.jpg", caption: text.slice(0, 2000) });
      } else {
        if (data.length > MAX_VIDEO_BYTES) throw new Error("Video quá lớn (trên 50MB).");
        await client.sendFile({ chatId, data, fileName: post.asset?.title ? `${post.asset.title}.${path.split(".").pop()}` : (path.split("/").pop() ?? "video.mp4"), caption: text.slice(0, 2000) });
      }
      if (text.length > 2000) for (const chunk of splitMessage(text.slice(2000))) await client.sendMessage(chatId, chunk);
    });
  } catch (e) {
    return fail(e instanceof ZaloError ? e.message : errText(e));
  }
  await db.zaloPost.update({ where: { id: postId }, data: { status: "SENT", sentAt: new Date(), error: null } });
  return { ok: true };
}

export type DueSummary = { total: number; sent: number; failed: number; errors: string[] };

/** Đăng mọi bài PLANNED đã tới giờ (của các nhóm đang bật), theo thứ tự giờ. */
export async function runDuePosts(): Promise<DueSummary> {
  const due = await db.zaloPost.findMany({
    where: { status: "PLANNED", scheduledAt: { lte: new Date() }, group: { isActive: true } },
    orderBy: { scheduledAt: "asc" },
    select: { id: true },
    take: 50,
  });
  const sum: DueSummary = { total: due.length, sent: 0, failed: 0, errors: [] };
  for (const d of due) {
    const r = await publishPost(d.id);
    if (r.ok) sum.sent++;
    else {
      sum.failed++;
      if (sum.errors.length < 3) sum.errors.push(r.error);
    }
  }
  return sum;
}

/**
 * Một vòng chạy tự động (máy chủ gọi định kỳ): nhóm nào chưa có kịch bản cho ngày mai thì lên kịch bản, rồi đăng các bài đến giờ.
 * Chỉ chạy khi bật "Tự động" trong cài đặt.
 */
export async function runCareCycle(): Promise<{ skipped?: string; planned: number; due?: DueSummary; errors: string[] }> {
  const s = await getZaloSettings();
  if (!s.enabled || !s.care || !s.careAutoRun) return { skipped: "Chạy tự động đang tắt.", planned: 0, errors: [] };

  const tz = getEnv().APP_TIMEZONE;
  const tomorrow = addDays(todayKey(), 1);
  const from = zonedStartOfDay(tomorrow, tz)!;
  const to = zonedStartOfDay(addDays(tomorrow, 1), tz)!;
  const groups = await db.zaloGroup.findMany({ where: { isActive: true, careEnabled: true }, select: { id: true, name: true } });

  let planned = 0;
  const errors: string[] = [];
  for (const g of groups) {
    const has = await db.zaloPost.count({ where: { groupId: g.id, scheduledAt: { gte: from, lt: to }, status: { not: "SKIPPED" } } });
    if (has > 0) continue;
    const r = await generateCarePlan(g.id);
    if (r.ok) planned += r.created;
    else errors.push(`${g.name}: ${r.error}`);
  }
  const due = await runDuePosts();
  return { planned, due, errors };
}
