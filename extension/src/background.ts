/**
 * Service worker của extension (docs/thiet-ke-module-lead-facebook.md mục 8.2). Hẹn giờ, hỏi webapp có việc gì, quét TUẦN TỰ từng bài
 * (một tab một lúc), gửi kết quả về. Extension KHÔNG tự đăng, tự comment hay tự bấm gửi gì lên Facebook: chỉ mở đúng các link bài mà
 * webapp giao (bài của chính nick), đọc comment, rồi đóng tab.
 *
 * Độ trễ giữa các bài là số cố định lấy từ cấu hình của webapp (không ngẫu nhiên hoá): chỉ để không tạo tải bất thường lên tài khoản.
 */
import { parsePostUrl } from "../../lib/fb/urls";
import { api, ApiError } from "./api";
import { APP_ORIGIN } from "./config";
import { isCheckpointUrl, isLoginUrl } from "./content/selectors";
import { store } from "./storage";
import type { BackgroundMessage, ContentMessage, CycleSummary, MeResponse, PostInfo, ScanJob, ScanResult, StatusResponse } from "./types";

const ALARM = "tm-lead-poll";
/** Chu kỳ khác còn được coi là đang chạy trong bấy nhiêu phút (service worker có thể bị tắt giữa chừng). */
const CYCLE_LOCK_MS = 20 * 60_000;
const TAB_LOAD_TIMEOUT_MS = 60_000;
const SCAN_TIMEOUT_MS = 5 * 60_000;
const KEEP_ALIVE_MS = 20_000;

let running = false;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ---------- Hẹn giờ ---------- */

async function setupAlarm(): Promise<void> {
  let minutes = 10;
  const token = await store.getToken();
  if (token) {
    try {
      minutes = (await api.me(token)).config.poll_minutes;
    } catch {
      /* dùng mặc định 10 phút */
    }
  }
  await chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: Math.max(1, minutes) });
}

chrome.runtime.onInstalled.addListener(() => void setupAlarm());
chrome.runtime.onStartup.addListener(() => void setupAlarm());
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) void runCycle("alarm", false);
});

/* ---------- Tab ---------- */

async function waitTabComplete(tabId: number, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const t = await chrome.tabs.get(tabId);
    if (t.status === "complete") return true;
    await sleep(500);
  }
  return false;
}

/** Gửi tin cho content script, thử lại vài lần (cách nhau 1 giây cố định) nếu nó chưa kịp nạp. */
async function sendToContent<T>(tabId: number, msg: ContentMessage, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  for (let i = 0; i < 10; i++) {
    try {
      return await Promise.race([
        chrome.tabs.sendMessage(tabId, msg) as Promise<T>,
        sleep(Math.max(0, deadline - Date.now())).then(() => {
          throw new Error("Content script không trả lời kịp.");
        }),
      ]);
    } catch (e) {
      lastError = e;
      if (!/Receiving end does not exist|Could not establish connection/i.test(String((e as Error)?.message))) break;
      await sleep(1000);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Không liên lạc được với trang Facebook.");
}

/* ---------- Một chu kỳ quét ---------- */

type ScanOneResult = { newComments: number; newLeads: number; stop: string | null };

async function scanOne(token: string, me: MeResponse, job: ScanJob): Promise<ScanOneResult> {
  const tab = await chrome.tabs.create({ url: job.url, active: false });
  const tabId = tab.id;
  if (tabId === undefined) return { newComments: 0, newLeads: 0, stop: "Không mở được tab." };
  try {
    if (!(await waitTabComplete(tabId, TAB_LOAD_TIMEOUT_MS))) {
      await api.log(token, "scan_fail", { reason: "tab_timeout", post_id: job.post_id }).catch(() => undefined);
      return { newComments: 0, newLeads: 0, stop: null }; // bài này lỗi tải, thử bài kế
    }
    const url = (await chrome.tabs.get(tabId)).url ?? "";
    if (isCheckpointUrl(url)) return await reportAndStop(token, "checkpoint", job, "Facebook đang yêu cầu xác minh nick. Đã dừng và báo về webapp.");
    if (isLoginUrl(url)) return await reportAndStop(token, "scan_fail", job, "Facebook đang hiện trang đăng nhập. Hãy đăng nhập Facebook trên Chrome này rồi quét lại.", { reason: "login_required" });

    const result = await sendToContent<ScanResult>(tabId, { type: "SCAN", ownProfileUrl: me.account.profile_url, ownDisplayName: me.account.display_name }, SCAN_TIMEOUT_MS);
    switch (result.state) {
      case "checkpoint":
        return await reportAndStop(token, "checkpoint", job, "Facebook đang yêu cầu xác minh nick. Đã dừng và báo về webapp.");
      case "login":
        return await reportAndStop(token, "scan_fail", job, "Facebook đang hiện trang đăng nhập. Hãy đăng nhập Facebook trên Chrome này rồi quét lại.", { reason: "login_required" });
      case "selector_broken":
        return await reportAndStop(token, "selector_broken", job, `Không đọc được trang Facebook (mục "${result.item}"). Facebook có thể đã đổi giao diện. Đã báo về webapp.`, { item: result.item, detail: result.detail });
      case "ok": {
        const r = await api.postComments(token, job.post_id, { scanned_at: new Date().toISOString(), complete: result.complete, comments: result.comments });
        return { newComments: r.new_comments, newLeads: r.new_leads, stop: null };
      }
    }
  } finally {
    await chrome.tabs.remove(tabId).catch(() => undefined);
  }
}

async function reportAndStop(token: string, type: "checkpoint" | "scan_fail" | "selector_broken", job: ScanJob, message: string, extra: Record<string, unknown> = {}): Promise<ScanOneResult> {
  await api.log(token, type, { post_id: job.post_id, url: job.url, ...extra }).catch(() => undefined);
  return { newComments: 0, newLeads: 0, stop: message };
}

async function runCycle(trigger: "alarm" | "manual", force: boolean): Promise<void> {
  if (running) return;
  const startedAt = await store.getCycleStartedAt();
  if (startedAt && Date.now() - startedAt < CYCLE_LOCK_MS) return;
  const token = await store.getToken();
  if (!token) return;

  running = true;
  await store.setCycleStartedAt(Date.now());
  // Giữ service worker không bị tắt trong lúc chờ giữa các bài (Chrome tắt service worker rảnh sau khoảng 30 giây)
  const keepAlive = setInterval(() => void chrome.runtime.getPlatformInfo(), KEEP_ALIVE_MS);
  const summary: CycleSummary = { at: new Date().toISOString(), trigger, posts: 0, newComments: 0, newLeads: 0, error: null };
  try {
    const me = await api.me(token);
    if (me.account.status !== "ACTIVE") {
      summary.error = me.account.status === "RESTRICTED" ? "Nick đang bị hạn chế, chờ quản trị viên bật lại trên webapp." : "Nick đang tạm dừng trên webapp.";
      return;
    }
    const jobs = await api.jobs(token, force);
    if (jobs.paused_reason) {
      summary.error = "Webapp tạm ngừng giao việc cho nick này.";
      return;
    }
    for (const [i, job] of jobs.scan.entries()) {
      // Chỉ mở link bài Facebook đúng dạng mà webapp giao; link khác bị bỏ qua
      if (!parsePostUrl(job.url)) continue;
      if (i > 0) await sleep(me.config.delay_seconds_between_posts * 1000);
      const r = await scanOne(token, me, job);
      summary.posts++;
      summary.newComments += r.newComments;
      summary.newLeads += r.newLeads;
      if (r.stop) {
        summary.error = r.stop;
        break;
      }
    }
    await store.setError(null);
  } catch (e) {
    if (e instanceof ApiError && e.isAuthFailure) {
      summary.error = e.code === "TOKEN_REVOKED" ? "Mã kết nối đã bị thu hồi. Hãy tạo mã mới trên webapp và nhập lại ở Cài đặt." : e.message;
      await store.setError(summary.error);
      await chrome.alarms.clear(ALARM); // mã hỏng thì ngừng hỏi việc cho tới khi nhập lại mã
    } else {
      summary.error = e instanceof Error ? e.message : String(e);
    }
  } finally {
    clearInterval(keepAlive);
    running = false;
    await store.setCycleStartedAt(null);
    await store.setLastCycle(summary);
  }
}

/* ---------- Theo dõi bài đang mở ---------- */

async function followActiveTab(tabId: number): Promise<{ ok: boolean; message: string }> {
  const token = await store.getToken();
  if (!token) return { ok: false, message: "Chưa kết nối. Mở Cài đặt và nhập mã kết nối." };
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || !parsePostUrl(tab.url)) return { ok: false, message: "Tab hiện tại không phải một bài đăng Facebook." };
  let info: PostInfo;
  try {
    info = await sendToContent<PostInfo>(tabId, { type: "GET_POST_INFO" }, 15_000);
  } catch {
    return { ok: false, message: "Không đọc được trang. Tải lại trang Facebook rồi thử lại." };
  }
  if (!info.ok) return { ok: false, message: info.error };
  try {
    const r = await api.registerPost(token, {
      url: info.url,
      group_url: info.groupUrl,
      content_snapshot: info.content,
      author_profile_url: info.authorProfileUrl,
      author_name: info.authorName,
    });
    return { ok: true, message: r.created ? "Đã thêm bài vào danh sách theo dõi." : "Bài này đã có trong danh sách theo dõi." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/* ---------- Tin nhắn từ popup và trang cài đặt ---------- */

async function getStatus(): Promise<StatusResponse> {
  const base = { running, lastCycle: await store.getLastCycle(), appOrigin: APP_ORIGIN };
  const token = await store.getToken();
  if (!token) return { ...base, connected: false, error: await store.getError() };
  try {
    const me = await api.me(token);
    return { ...base, connected: true, user: me.user, account: me.account, error: await store.getError() };
  } catch (e) {
    return { ...base, connected: false, error: e instanceof Error ? e.message : String(e) };
  }
}

chrome.runtime.onMessage.addListener((msg: BackgroundMessage, _sender, sendResponse) => {
  void (async () => {
    switch (msg.type) {
      case "GET_STATUS":
        return sendResponse(await getStatus());
      case "RUN_NOW":
        void runCycle("manual", true);
        return sendResponse({ started: !running });
      case "FOLLOW_ACTIVE_TAB":
        return sendResponse(await followActiveTab(msg.tabId));
      case "CONNECT": {
        const token = msg.token.trim();
        try {
          await api.me(token); // kiểm tra mã trước khi lưu
        } catch (e) {
          return sendResponse({ ok: false, message: e instanceof Error ? e.message : String(e) });
        }
        await store.setToken(token);
        await store.setError(null);
        await setupAlarm();
        return sendResponse({ ok: true, message: "Đã kết nối." });
      }
      case "DISCONNECT":
        await store.clearToken();
        await chrome.alarms.clear(ALARM);
        return sendResponse({ ok: true });
    }
  })();
  return true; // trả lời bất đồng bộ
});
