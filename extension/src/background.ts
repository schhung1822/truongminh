/**
 * Service worker của extension (docs/thiet-ke-module-lead-facebook.md mục 8.2). Hẹn giờ, hỏi webapp có việc gì, quét TUẦN TỰ từng bài
 * (một cửa sổ/tab một lúc), gửi kết quả về. Extension KHÔNG tự đăng, tự comment hay tự bấm gửi gì lên Facebook: chỉ mở đúng các
 * link bài mà webapp giao (bài của chính nick), đọc comment, rồi đóng.
 *
 * Độ trễ giữa các bài là số cố định lấy từ cấu hình của webapp (không ngẫu nhiên hoá): chỉ để không tạo tải bất thường lên tài khoản.
 */
import { parsePostUrl } from "../../lib/fb/urls";
import { api, ApiError } from "./api";
import { APP_ORIGIN, EXT_NAME, EXT_VERSION } from "./config";
import { isCheckpointUrl, isLoginUrl } from "./content/selectors";
import { store } from "./storage";
import type { BackgroundMessage, ContentMessage, CycleSummary, DiagnosticReport, MeResponse, PostInfo, ScanJob, ScanResult, SimpleResult, StatusResponse } from "./types";

const ALARM = "data-lead-poll";
const TAB_LOAD_TIMEOUT_MS = 60_000;
const SCAN_TIMEOUT_MS = 5 * 60_000;
const KEEP_ALIVE_MS = 20_000;
/** Cửa sổ quét riêng: đủ rộng để Facebook hiện giao diện máy tính (dưới ~900px Facebook có thể đổi bố cục). */
const SCAN_WINDOW = { width: 980, height: 760 };

let running = false;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ---------- Hẹn giờ ---------- */

async function setupAlarm(): Promise<void> {
  let minutes = 10;
  const token = await store.getToken();
  if (!token) return;
  try {
    minutes = (await api.me(token)).config.poll_minutes;
  } catch {
    /* dùng mặc định 10 phút */
  }
  await chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: Math.max(1, minutes) });
}

chrome.runtime.onInstalled.addListener(() => {
  void store.setProgress(null);
  void setupAlarm();
});
chrome.runtime.onStartup.addListener(() => {
  void store.setProgress(null);
  void setupAlarm();
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) void runCycle("alarm", false);
});

/* ---------- Tab / cửa sổ ---------- */

async function waitTabComplete(tabId: number, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const t = await chrome.tabs.get(tabId);
    if (t.status === "complete") return true;
    await sleep(500);
  }
  return false;
}

const NOT_REACHABLE = /Receiving end does not exist|Could not establish connection/i;

/**
 * Bảo đảm bộ đọc trang (content script) đang chạy trong tab: PING, không trả lời thì nạp bổ sung bằng chrome.scripting
 * (tab mở trước khi cài extension, hoặc Facebook ở host khác lúc khai báo). Chỉ nạp vào tab facebook.com.
 */
async function ensureContentScript(tabId: number): Promise<void> {
  const ping = () => chrome.tabs.sendMessage(tabId, { type: "PING" } satisfies ContentMessage);
  for (let i = 0; i < 6; i++) {
    try {
      await ping();
      return;
    } catch (e) {
      if (!NOT_REACHABLE.test(errText(e))) throw e;
    }
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !/^https:\/\/([a-z0-9-]+\.)?facebook\.com\//i.test(tab.url)) throw new Error("Tab này không phải trang Facebook.");
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    } catch (e) {
      throw new Error(`Không nạp được bộ đọc trang vào tab Facebook: ${errText(e)}`);
    }
    await sleep(1000);
  }
  throw new Error("Bộ đọc trang không trả lời sau khi nạp.");
}

async function sendToContent<T>(tabId: number, msg: ContentMessage, timeoutMs: number): Promise<T> {
  await ensureContentScript(tabId);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      chrome.tabs.sendMessage(tabId, msg) as Promise<T>,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Bộ đọc trang không trả lời kịp (quá thời gian)." )), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

type Opened = { tabId: number; windowId: number | null };

/** Mở bài để quét theo thiết lập: cửa sổ nhỏ riêng (Facebook vẽ đủ nội dung) hoặc tab nền. */
async function openForScan(url: string): Promise<Opened> {
  const settings = await store.getSettings();
  if (settings.scanMode === "tab") {
    const tab = await chrome.tabs.create({ url, active: false });
    if (tab.id === undefined) throw new Error("Không mở được tab.");
    return { tabId: tab.id, windowId: null };
  }
  let left: number | undefined;
  let top: number | undefined;
  try {
    const cur = await chrome.windows.getLastFocused();
    if (cur.left !== undefined && cur.top !== undefined && cur.width && cur.height) {
      left = Math.max(0, cur.left + cur.width - SCAN_WINDOW.width - 24);
      top = Math.max(0, cur.top + cur.height - SCAN_WINDOW.height - 24);
    }
  } catch {
    /* để Chrome tự đặt */
  }
  const win = await chrome.windows.create({ url, type: "popup", focused: false, width: SCAN_WINDOW.width, height: SCAN_WINDOW.height, left, top });
  const tabId = win?.tabs?.[0]?.id;
  if (tabId === undefined || win?.id === undefined) throw new Error("Không mở được cửa sổ quét.");
  return { tabId, windowId: win.id };
}

async function closeOpened(o: Opened): Promise<void> {
  if (o.windowId !== null) await chrome.windows.remove(o.windowId).catch(() => undefined);
  else await chrome.tabs.remove(o.tabId).catch(() => undefined);
}

/* ---------- Một chu kỳ quét ---------- */

type ScanOneResult = { newComments: number; newLeads: number; stop: string | null };

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.|web\.)?facebook\.com\//, "").replace(/\?.*$/, "").slice(0, 60);

async function reportAndStop(token: string, type: "checkpoint" | "scan_fail" | "selector_broken", job: ScanJob, message: string, extra: Record<string, unknown> = {}): Promise<ScanOneResult> {
  await api.log(token, type, { post_id: job.post_id, url: job.url, ...extra }).catch(() => undefined);
  await store.addEvent(type === "checkpoint" ? "error" : "warn", message);
  return { newComments: 0, newLeads: 0, stop: message };
}

async function scanOne(token: string, me: MeResponse, job: ScanJob): Promise<ScanOneResult> {
  const label = shortUrl(job.url);
  let opened: Opened;
  try {
    opened = await openForScan(job.url);
  } catch (e) {
    await store.addEvent("error", `Không mở được bài ${label}: ${errText(e)}`);
    return { newComments: 0, newLeads: 0, stop: null };
  }
  try {
    if (!(await waitTabComplete(opened.tabId, TAB_LOAD_TIMEOUT_MS))) {
      await api.log(token, "scan_fail", { reason: "tab_timeout", post_id: job.post_id }).catch(() => undefined);
      await store.addEvent("warn", `Bài ${label}: trang tải quá lâu, bỏ qua lần này.`);
      return { newComments: 0, newLeads: 0, stop: null };
    }
    const url = (await chrome.tabs.get(opened.tabId)).url ?? "";
    if (isCheckpointUrl(url)) return await reportAndStop(token, "checkpoint", job, "Facebook đang yêu cầu xác minh nick. Đã dừng quét và báo về webapp; nick tạm ngừng cho tới khi quản trị viên bật lại.");
    if (isLoginUrl(url)) return await reportAndStop(token, "scan_fail", job, "Facebook đang hiện trang đăng nhập. Hãy đăng nhập Facebook trên Chrome này rồi bấm Quét ngay.", { reason: "login_required" });

    let result: ScanResult;
    try {
      result = await sendToContent<ScanResult>(opened.tabId, { type: "SCAN", ownProfileUrl: me.account.profile_url, ownDisplayName: me.account.display_name }, SCAN_TIMEOUT_MS);
    } catch (e) {
      const msg = errText(e);
      const reason = /không tồn tại|No tab with id/i.test(msg) ? "tab_closed" : "content_unreachable";
      await api.log(token, "scan_fail", { reason, post_id: job.post_id, host: (() => { try { return new URL(url).hostname; } catch { return ""; } })(), message: msg.slice(0, 200) }).catch(() => undefined);
      await store.addEvent("error", `Bài ${label}: ${reason === "tab_closed" ? "cửa sổ quét bị đóng giữa chừng" : "không đọc được trang"} (${msg.slice(0, 120)}).`);
      return { newComments: 0, newLeads: 0, stop: null };
    }

    switch (result.state) {
      case "checkpoint":
        return await reportAndStop(token, "checkpoint", job, "Facebook đang yêu cầu xác minh nick. Đã dừng quét và báo về webapp; nick tạm ngừng cho tới khi quản trị viên bật lại.");
      case "login":
        return await reportAndStop(token, "scan_fail", job, "Facebook đang hiện trang đăng nhập. Hãy đăng nhập Facebook trên Chrome này rồi bấm Quét ngay.", { reason: "login_required" });
      case "selector_broken":
        return await reportAndStop(token, "selector_broken", job, `Không đọc được trang Facebook ở bài ${label} (mục "${result.item}"). Bấm "Chẩn đoán trang này" trên bài đó và gửi báo cáo cho người phát triển.`, { item: result.item, detail: result.detail, resolved_url: result.resolvedUrl });
      case "ok": {
        const r = await api.postComments(token, job.post_id, {
          scanned_at: new Date().toISOString(),
          complete: result.complete,
          comments: result.comments,
          resolved_url: result.resolvedUrl,
          note: result.note ?? null,
        });
        const extra = result.complete ? "" : " (chưa đọc hết, lần sau quét tiếp)";
        await store.addEvent(r.new_leads > 0 ? "ok" : "info", `Bài ${label}: ${result.comments.length} comment trên trang, ${r.new_comments} mới, ${r.new_leads} lead mới${extra}.${result.note ? " " + result.note : ""}`);
        return { newComments: r.new_comments, newLeads: r.new_leads, stop: null };
      }
    }
  } finally {
    await closeOpened(opened);
  }
}

async function notifyLeads(count: number): Promise<void> {
  if (count <= 0 || !(await store.getSettings()).notifyLeads) return;
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon128.png"),
      title: EXT_NAME,
      message: `Có ${count} lead mới từ comment Facebook. Xem ở webapp: Lead Facebook > Lead.`,
      priority: 1,
    });
  } catch {
    /* máy không cho thông báo */
  }
}

async function runCycle(trigger: "alarm" | "manual", force: boolean): Promise<void> {
  if (running) return;
  const token = await store.getToken();
  if (!token) return;

  running = true;
  // Giữ service worker không bị tắt trong lúc chờ giữa các bài (Chrome tắt service worker rảnh sau khoảng 30 giây)
  const keepAlive = setInterval(() => void chrome.runtime.getPlatformInfo(), KEEP_ALIVE_MS);
  const summary: CycleSummary = { at: new Date().toISOString(), trigger, posts: 0, newComments: 0, newLeads: 0, error: null };
  try {
    const me = await api.me(token);
    if (me.account.status !== "ACTIVE") {
      summary.error = me.account.status === "RESTRICTED" ? "Nick đang bị hạn chế trên webapp (sau một lần Facebook yêu cầu xác minh). Chờ quản trị viên bật lại." : "Nick đang tạm dừng trên webapp.";
      return;
    }
    const jobs = await api.jobs(token, force);
    if (jobs.paused_reason) {
      summary.error = "Webapp tạm ngừng giao việc cho nick này.";
      return;
    }
    const list = jobs.scan.filter((j) => parsePostUrl(j.url)); // chỉ mở link bài Facebook đúng dạng mà webapp giao
    if (list.length === 0) {
      await store.addEvent("info", trigger === "manual" ? "Không có bài nào cần quét lúc này (bài chưa đến lượt hoặc chưa thêm bài theo dõi)." : "Chu kỳ tự động: không có bài nào đến lượt.");
      return;
    }
    await store.addEvent("info", `Bắt đầu quét ${list.length} bài, lần lượt từng bài.`);
    for (const [i, job] of list.entries()) {
      if (i > 0) await sleep(me.config.delay_seconds_between_posts * 1000);
      await store.setProgress({ total: list.length, index: i + 1, url: shortUrl(job.url), startedAt: summary.at });
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
    await notifyLeads(summary.newLeads);
  } catch (e) {
    if (e instanceof ApiError && e.isAuthFailure) {
      summary.error = e.code === "TOKEN_REVOKED" ? "Mã kết nối đã bị thu hồi trên webapp. Tạo mã mới ở Lead Facebook > Kết nối extension rồi dán lại ở Cài đặt." : e.message;
      await store.setError(summary.error);
      await chrome.alarms.clear(ALARM); // mã hỏng thì ngừng hỏi việc cho tới khi nhập lại mã
    } else {
      summary.error = errText(e);
    }
    await store.addEvent("error", summary.error);
  } finally {
    clearInterval(keepAlive);
    running = false;
    await store.setProgress(null);
    await store.setLastCycle(summary);
  }
}

/* ---------- Theo dõi bài đang mở, chẩn đoán ---------- */

async function activeFacebookTab(tabId: number): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url) return { ok: false, message: "Không đọc được tab đang mở." };
  if (!/^https:\/\/([a-z0-9-]+\.)?facebook\.com\//i.test(tab.url)) return { ok: false, message: "Tab đang mở không phải Facebook. Hãy mở bài trên Facebook rồi bấm lại." };
  return { ok: true, url: tab.url };
}

async function followActiveTab(tabId: number): Promise<SimpleResult> {
  const token = await store.getToken();
  if (!token) return { ok: false, message: "Chưa kết nối. Mở Cài đặt và dán mã kết nối lấy từ webapp." };
  const t = await activeFacebookTab(tabId);
  if (!t.ok) return t;
  if (!parsePostUrl(t.url)) {
    return { ok: false, message: "Tab đang mở không phải trang riêng của một bài đăng. Trên Facebook, bấm vào dòng thời gian đăng của bài (ví dụ \"2 giờ\") để mở bài ở trang riêng, rồi bấm lại nút này." };
  }
  let info: PostInfo;
  try {
    info = await sendToContent<PostInfo>(tabId, { type: "GET_POST_INFO" }, 20_000);
  } catch (e) {
    return { ok: false, message: `Không đọc được trang: ${errText(e)} Thử tải lại trang Facebook (F5) rồi bấm lại.` };
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
    const msg = r.created ? "Đã thêm bài vào danh sách theo dõi. Bài sẽ được quét ở chu kỳ kế tiếp, hoặc bấm Quét ngay." : "Bài này đã có trong danh sách theo dõi.";
    await store.addEvent("ok", `Theo dõi bài ${shortUrl(info.url)}: ${r.created ? "đã thêm" : "đã có từ trước"}.`);
    return { ok: true, message: msg };
  } catch (e) {
    const msg = e instanceof ApiError && e.code === "NOT_OWN_POST" ? `${e.message} Nick đang kết nối là "${(await api.me(token).catch(() => null))?.account.display_name ?? "?"}".` : errText(e);
    await store.addEvent("warn", `Theo dõi bài thất bại: ${msg}`);
    return { ok: false, message: msg };
  }
}

async function diagnoseActiveTab(tabId: number): Promise<{ ok: boolean; message: string; report?: DiagnosticReport }> {
  const token = await store.getToken();
  const t = await activeFacebookTab(tabId);
  if (!t.ok) return t;
  let me: MeResponse | null = null;
  if (token) me = await api.me(token).catch(() => null);
  let report: DiagnosticReport;
  try {
    report = await sendToContent<DiagnosticReport>(tabId, { type: "DIAGNOSE", ownProfileUrl: me?.account.profile_url ?? "", ownDisplayName: me?.account.display_name ?? "" }, 40_000);
  } catch (e) {
    return { ok: false, message: `Không chạy được chẩn đoán trên tab này: ${errText(e)}` };
  }
  await store.setLastDiagnostic(report);
  if (token) await api.log(token, "scan_fail", { reason: "diagnostic", ...report }).catch(() => undefined);
  await store.addEvent("info", `Đã chẩn đoán trang ${report.host}: ${report.counts.articles} article, đọc được ${report.counts.commentsRead} comment${token ? ", đã gửi báo cáo về webapp" : ""}.`);
  return { ok: true, message: `Đã chẩn đoán xong: ${report.counts.commentsRead} comment đọc được, ${report.counts.articles} khối article. Báo cáo đã lưu${token ? " và gửi về webapp" : ""}; bấm "Sao chép báo cáo" để gửi cho người phát triển.`, report };
}

/* ---------- Trạng thái ---------- */

async function getStatus(): Promise<StatusResponse> {
  const [lastCycle, progress, settings, alarm, token] = await Promise.all([store.getLastCycle(), store.getProgress(), store.getSettings(), chrome.alarms.get(ALARM), store.getToken()]);
  const base = { running, progress: running ? progress : null, lastCycle, appOrigin: APP_ORIGIN, version: EXT_VERSION, settings, nextRunAt: alarm?.scheduledTime ? new Date(alarm.scheduledTime).toISOString() : null };
  if (!token) return { ...base, connected: false, error: await store.getError() };
  try {
    const me = await api.me(token);
    return { ...base, connected: true, user: me.user, account: me.account, error: await store.getError() };
  } catch (e) {
    return { ...base, connected: false, error: errText(e) };
  }
}

/* ---------- Tin nhắn từ popup và trang cài đặt ---------- */

async function handle(msg: BackgroundMessage): Promise<unknown> {
  switch (msg.type) {
    case "GET_STATUS":
      return getStatus();
    case "RUN_NOW": {
      if (running) return { started: false, message: "Đang có một lần quét chạy rồi." };
      void runCycle("manual", true);
      return { started: true, message: "Đang quét các bài theo dõi, lần lượt từng bài. Có thể đóng cửa sổ này." };
    }
    case "FOLLOW_ACTIVE_TAB":
      return followActiveTab(msg.tabId);
    case "DIAGNOSE_ACTIVE_TAB":
      return diagnoseActiveTab(msg.tabId);
    case "CONNECT": {
      const token = msg.token.trim();
      if (!/^tmx_[A-Za-z0-9_-]{43}$/.test(token)) return { ok: false, message: "Mã không đúng dạng. Mã kết nối bắt đầu bằng tmx_ và dài 47 ký tự; hãy sao chép đủ cả mã." } satisfies SimpleResult;
      try {
        const me = await api.me(token);
        await store.setToken(token);
        await store.setError(null);
        await store.addEvent("ok", `Đã kết nối: ${me.user} · nick ${me.account.display_name}.`);
        await setupAlarm();
        void runCycle("manual", false);
        return { ok: true, message: `Đã kết nối với webapp: ${me.user} · nick ${me.account.display_name}. Extension sẽ tự quét mỗi ${me.config.poll_minutes} phút.` } satisfies SimpleResult;
      } catch (e) {
        return { ok: false, message: errText(e) } satisfies SimpleResult;
      }
    }
    case "DISCONNECT":
      await store.clearToken();
      await chrome.alarms.clear(ALARM);
      await store.addEvent("info", "Đã ngắt kết nối và xoá mã khỏi máy này.");
      return { ok: true, message: "Đã ngắt kết nối." } satisfies SimpleResult;
    case "GET_SETTINGS":
      return store.getSettings();
    case "SET_SETTINGS":
      return store.setSettings(msg.settings);
    case "GET_EVENTS":
      return store.getEvents();
    case "GET_LAST_DIAGNOSTIC":
      return store.getLastDiagnostic();
  }
}

chrome.runtime.onMessage.addListener((msg: BackgroundMessage, _sender, sendResponse) => {
  // Luôn trả lời, kể cả khi lỗi: popup không bao giờ bị "bấm mà không thấy gì"
  handle(msg).then(
    (r) => sendResponse(r ?? { ok: false, message: "Không có phản hồi." }),
    (e) => sendResponse({ ok: false, message: `Lỗi bên trong extension: ${errText(e)}` }),
  );
  return true; // trả lời bất đồng bộ
});
