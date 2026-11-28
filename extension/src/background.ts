/**
 * Service worker của extension (docs/thiet-ke-module-lead-facebook.md mục 8.2). Hẹn giờ, hỏi webapp có việc gì, quét TUẦN TỰ từng bài
 * (một cửa sổ/tab một lúc), gửi kết quả về. Extension KHÔNG tự đăng, tự comment hay tự bấm gửi gì lên Facebook: chỉ mở đúng các
 * link bài mà webapp giao (do người dùng chủ động theo dõi), đọc comment, rồi đóng.
 *
 * Luồng trả lời (mục 8.3 và bổ sung v1.1 mục 5) chỉ chạy khi người dùng bấm "Xử lý trả lời" trên popup: mở bài, nhờ bộ đọc
 * trang điền sẵn câu ĐÃ ĐƯỢC NGƯỜI DUYỆT trên webapp vào ô trả lời của đúng comment, rồi chờ người đọc và tự bấm gửi.
 *
 * Độ trễ giữa các bài là số cố định lấy từ cấu hình của webapp (không ngẫu nhiên hoá): chỉ để không tạo tải bất thường lên tài khoản.
 */
import { parsePostUrl } from "../../lib/fb/urls";
import { api, ApiError } from "./api";
import { APP_ORIGIN, EXT_NAME, EXT_VERSION } from "./config";
import { isCheckpointUrl, isLoginUrl } from "./content/selectors";
import { store } from "./storage";
import { canSkipFullScan } from "./scan-policy";
import type { BackgroundMessage, CommentCountResult, ContentMessage, CycleSummary, DiagnosticReport, FillResult, MeResponse, PostInfo, ReplyJob, ReplyProgress, ScanJob, ScanResult, SimpleResult, StatusResponse, WaitResult } from "./types";

const ALARM = "data-lead-poll";
const TAB_LOAD_TIMEOUT_MS = 60_000;
const SCAN_TIMEOUT_MS = 10 * 60_000;
const KEEP_ALIVE_MS = 20_000;
/** Cửa sổ quét riêng: đủ rộng để Facebook hiện giao diện máy tính (dưới ~900px Facebook có thể đổi bố cục). */
const SCAN_WINDOW = { width: 980, height: 760 };

/** Đang quét hoặc đang xử lý trả lời: hai việc không chạy chồng nhau (cùng dùng tab Facebook và cùng một nick). */
let running = false;
let replyProgress: ReplyProgress = null;
/** Người dùng bấm "Dừng" trên popup trong lúc xử lý trả lời. */
let replyStop = false;

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

/** Luôn kiểm tra nhanh tổng comment trong tab nền trước; tab không lấy focus và sẽ được đóng ngay nếu tổng không đổi. */
async function openCountProbe(url: string): Promise<Opened> {
  const tab = await chrome.tabs.create({ url, active: false });
  if (tab.id === undefined) throw new Error("Không mở được tab nền để kiểm tra bài.");
  return { tabId: tab.id, windowId: null };
}

/** Khi cần đọc đầy đủ, chuyển chính tab nền sang cửa sổ nhỏ không lấy focus; không tải lại bài lần hai. */
async function promoteForFullScan(opened: Opened): Promise<Opened> {
  const settings = await store.getSettings();
  if (settings.scanMode === "tab" || opened.windowId !== null) return opened;
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
  const win = await chrome.windows.create({ tabId: opened.tabId, type: "popup", focused: false, width: SCAN_WINDOW.width, height: SCAN_WINDOW.height, left, top });
  if (win?.id === undefined) throw new Error("Không mở được cửa sổ quét.");
  return { tabId: opened.tabId, windowId: win.id };
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
    opened = await openCountProbe(job.url);
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

    // Pha 1 chạy trong tab nền: chỉ đọc tổng comment. Mốc chỉ được server cấp sau một lần quét đầy đủ đủ tin cậy.
    let countResult: CommentCountResult | null = null;
    try {
      countResult = await sendToContent<CommentCountResult>(opened.tabId, { type: "GET_COMMENT_COUNT" }, 40_000);
    } catch {
      // Không đọc được bộ đếm thì vẫn chuyển sang quét đầy đủ; không để tối ưu nhanh làm mất dữ liệu.
    }
    if (countResult?.state === "checkpoint") return await reportAndStop(token, "checkpoint", job, "Facebook đang yêu cầu xác minh nick. Đã dừng quét và báo về webapp; nick tạm ngừng cho tới khi quản trị viên bật lại.");
    if (countResult?.state === "login") return await reportAndStop(token, "scan_fail", job, "Facebook đang hiện trang đăng nhập. Hãy đăng nhập Facebook trên Chrome này rồi bấm Quét ngay.", { reason: "login_required" });
    if (countResult?.state === "ok" && canSkipFullScan(job, countResult.count)) {
      await api.postComments(token, job.post_id, {
        scanned_at: new Date().toISOString(),
        complete: true,
        comments: [],
        reported_comment_count: countResult.count,
        unchanged: true,
        resolved_url: countResult.resolvedUrl,
        note: "Tổng comment không đổi; đã bỏ qua đọc sâu.",
      });
      await store.addEvent("info", `Bài ${label}: tổng vẫn ${countResult.count} comment, đã kiểm tra ngầm và đóng tab.`);
      return { newComments: 0, newLeads: 0, stop: null };
    }

    try {
      opened = await promoteForFullScan(opened);
    } catch (e) {
      await store.addEvent("warn", `Bài ${label}: không mở được cửa sổ riêng, tiếp tục đọc trong tab nền (${errText(e).slice(0, 100)}).`);
    }

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
          reported_comment_count: result.reportedCount,
          unchanged: false,
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

/* ---------- Xử lý trả lời: điền sẵn câu đã duyệt, người tự bấm gửi ---------- */

/** Tìm comment trên bài lớn cần mở rộng nhiều lần: cho tối đa 4 phút mỗi câu. */
const REPLY_FILL_TIMEOUT_MS = 4 * 60_000;
/** Mỗi lượt hỏi "đã gửi chưa" ngắn, để service worker không giữ một yêu cầu quá lâu và để nút Dừng trên popup có tác dụng nhanh. */
const REPLY_WAIT_SLICE_MS = 8_000;
/** Chờ người đọc và bấm gửi tối đa bấy nhiêu cho một câu; quá thì dừng cả lượt (câu vẫn nằm trong ô, không mất). */
const REPLY_WAIT_TOTAL_MS = 10 * 60_000;
/** Nghỉ cố định giữa hai câu. */
const REPLY_GAP_MS = 2_000;
/** Lỗi do không nhận ra phần tử trên trang: báo thêm về webapp như một cảnh báo selector để người phát triển chỉnh bộ đọc. */
const SELECTOR_REASONS = ["reply_button_not_found", "reply_box_not_found", "fill_failed", "identity_unverified"];

async function setPanel(tabId: number, text: string, tone: "info" | "ok" | "warn", buttons = false): Promise<void> {
  await chrome.tabs.sendMessage(tabId, { type: "REPLY_PANEL", text, tone, buttons } satisfies ContentMessage).catch(() => undefined);
}

async function endReplyInPage(tabId: number, clearBox: boolean): Promise<void> {
  await chrome.tabs.sendMessage(tabId, { type: "REPLY_CANCEL", clearBox } satisfies ContentMessage).catch(() => undefined);
}

type ReplyReport = Parameters<typeof api.replyResult>;

/**
 * Báo kết quả một câu về webapp. Trả null khi webapp từ chối vì câu đó không còn ở trạng thái đã duyệt (vừa bị bỏ duyệt, bỏ qua,
 * hoặc đổi người đứng tên trên webapp trong lúc extension đang làm): nơi gọi bỏ qua câu đó và làm tiếp. Lỗi mã kết nối và lỗi
 * mạng vẫn ném ra để dừng cả lượt.
 */
async function reportReply(token: string, replyId: ReplyReport[1], status: ReplyReport[2], reason?: ReplyReport[3]): Promise<{ page_joined_cleared: boolean } | null> {
  try {
    return await api.replyResult(token, replyId, status, reason);
  } catch (e) {
    if (e instanceof ApiError && !e.isAuthFailure && (e.status === 404 || e.status === 409)) return null;
    throw e;
  }
}

/** Chờ người dùng bấm gửi (extension chỉ nhìn trang, không bấm). */
async function waitUntilSent(tabId: number): Promise<WaitResult["state"] | "timeout"> {
  const end = Date.now() + REPLY_WAIT_TOTAL_MS;
  while (Date.now() < end) {
    if (replyStop) return "stopped";
    let r: WaitResult;
    try {
      r = await sendToContent<WaitResult>(tabId, { type: "REPLY_WAIT", sliceMs: REPLY_WAIT_SLICE_MS }, REPLY_WAIT_SLICE_MS + 15_000);
    } catch {
      return "lost";
    }
    if (r.state !== "waiting") return r.state;
  }
  return "timeout";
}

/**
 * Xử lý các câu đã duyệt của MỘT nhóm (đứng tên nick, hoặc đứng tên fanpage). Các câu cùng một bài được webapp xếp liền nhau:
 * mở bài một lần trong một tab đang hiện, xử lý lần lượt từng comment (v1.1 mục 5.2). Với mỗi câu: điền, báo `filled`, dừng chờ
 * người bấm gửi, thấy câu trả lời xuất hiện thì báo `sent`.
 */
async function runReplies(group: "account" | "page"): Promise<void> {
  if (running) return;
  const token = await store.getToken();
  if (!token) return;
  running = true;
  replyStop = false;
  const keepAlive = setInterval(() => void chrome.runtime.getPlatformInfo(), KEEP_ALIVE_MS);
  const count = { sent: 0, skipped: 0, failed: 0 };
  let tabId: number | null = null;
  let note: string | null = null;
  const who = group === "page" ? "fanpage" : "nick";
  try {
    const me = await api.me(token);
    if (me.account.status !== "ACTIVE") {
      note = "Nick đang tạm dừng hoặc bị hạn chế trên webapp.";
      return;
    }
    let queue: ReplyJob[] = (await api.replies(token)).filter((j) => j.reply_as === group && parsePostUrl(j.post_url)); // chỉ mở link bài Facebook đúng dạng mà webapp giao
    const total = queue.length;
    if (total === 0) {
      note = `Không có câu nào đã duyệt chờ trả lời bằng ${who}.`;
      return;
    }
    await store.addEvent("info", `Bắt đầu xử lý ${total} câu trả lời bằng ${who}.`);

    let currentUrl = "";
    for (let index = 1; queue.length > 0 && !replyStop; index++) {
      const job = queue.shift()!;
      const label = shortUrl(job.post_url);
      replyProgress = { group, total, index, phase: "opening", url: label };

      // Mở bài một lần cho mọi câu của bài đó; sang bài khác thì dùng lại chính tab này
      if (tabId === null || currentUrl !== job.post_url) {
        if (tabId === null) {
          const tab = await chrome.tabs.create({ url: job.post_url, active: true });
          if (tab.id === undefined) throw new Error("Không mở được tab Facebook.");
          tabId = tab.id;
        } else {
          await chrome.tabs.update(tabId, { url: job.post_url, active: true });
          await sleep(800); // chờ tab rời trang cũ rồi mới kiểm tra "tải xong"
        }
        currentUrl = job.post_url;
        if (!(await waitTabComplete(tabId, TAB_LOAD_TIMEOUT_MS))) {
          await reportReply(token, job.reply_id, "failed", "page_load_timeout").catch(() => undefined);
          count.failed++;
          currentUrl = "";
          continue;
        }
        const url = (await chrome.tabs.get(tabId)).url ?? "";
        if (isCheckpointUrl(url)) {
          await api.log(token, "checkpoint", { post_id: job.post_id, url: job.post_url }).catch(() => undefined);
          note = "Facebook đang yêu cầu xác minh nick. Đã dừng và báo về webapp.";
          break;
        }
        if (isLoginUrl(url)) {
          note = "Facebook đang hiện trang đăng nhập. Hãy đăng nhập rồi bấm lại.";
          break;
        }
      }

      replyProgress = { group, total, index, phase: "filling", url: label };
      let fill: FillResult;
      try {
        fill = await sendToContent<FillResult>(
          tabId,
          { type: "REPLY_FILL", fbCommentId: job.fb_comment_id, parentFbCommentId: job.parent_fb_comment_id, text: job.text, replyAs: job.reply_as, pageName: job.page_name, ownProfileUrl: me.account.profile_url, ownDisplayName: me.account.display_name, pageNames: me.pages ?? [] },
          REPLY_FILL_TIMEOUT_MS,
        );
      } catch (e) {
        note = /No tab with id|không tồn tại/i.test(errText(e)) ? "Tab Facebook bị đóng giữa chừng. Các câu chưa xử lý vẫn nằm trong danh sách đã duyệt." : `Không làm việc được với trang Facebook: ${errText(e).slice(0, 120)}`;
        break;
      }

      if (fill.state === "checkpoint") {
        await api.log(token, "checkpoint", { post_id: job.post_id, url: job.post_url }).catch(() => undefined);
        note = "Facebook đang yêu cầu xác minh nick. Đã dừng và báo về webapp.";
        break;
      }
      if (fill.state === "login") {
        note = "Facebook đang hiện trang đăng nhập. Hãy đăng nhập rồi bấm lại.";
        break;
      }
      if (fill.state === "already_replied") {
        await reportReply(token, job.reply_id, "skipped", "already_replied");
        count.skipped++;
        await setPanel(tabId, `Câu ${index}/${total}: comment này đã có trả lời của ${who}, bỏ qua.`, "info");
      } else if (fill.state === "failed") {
        const r = await reportReply(token, job.reply_id, "failed", fill.reason);
        count.failed++;
        if (SELECTOR_REASONS.includes(fill.reason)) await api.log(token, "selector_broken", { item: fill.item ?? fill.reason, detail: fill.detail, post_id: job.post_id, reply_id: job.reply_id, flow: "reply" }).catch(() => undefined);
        await store.addEvent("warn", `Câu ${index}/${total} (bài ${label}): không điền được, lý do ${fill.reason}${fill.detail ? ` (${fill.detail.slice(0, 100)})` : ""}.`);
        await setPanel(tabId, `Câu ${index}/${total}: không điền được (${fill.reason}). Xem lý do ở webapp, mục Hàng chờ trả lời > Lỗi.`, "warn");
        if (fill.reason === "page_not_available" || r?.page_joined_cleared) {
          // Webapp vừa đổi các câu còn chờ của nhóm này (sang nick hoặc bỏ qua): chỉ làm tiếp những câu webapp còn giao
          const still = new Set((await api.replies(token)).map((x) => x.reply_id));
          queue = queue.filter((x) => still.has(x.reply_id));
        }
      } else if ((await reportReply(token, job.reply_id, "filled")) === null) {
        // Câu vừa bị bỏ duyệt / bỏ qua trên webapp trong lúc extension điền: xoá chữ khỏi ô, không để lại câu chưa được duyệt
        await endReplyInPage(tabId, true);
        count.skipped++;
        await store.addEvent("warn", `Câu ${index}/${total} (bài ${label}): webapp không còn giao câu này (vừa bị bỏ duyệt hoặc bỏ qua), đã xoá khỏi ô trả lời.`);
        await setPanel(tabId, `Câu ${index}/${total}: câu này vừa bị bỏ duyệt hoặc bỏ qua trên webapp nên đã được xoá khỏi ô trả lời.`, "warn");
      } else {
        replyProgress = { group, total, index, phase: "waiting", url: label };
        await setPanel(tabId, `Câu ${index}/${total} đã điền vào ô có viền cam, dưới tên ${group === "page" ? `fanpage ${job.page_name ?? ""}` : "nick của bạn"}.\nHãy đọc lại, sửa nếu cần, rồi TỰ bấm Enter để gửi. Extension không tự gửi.`, "warn", true);
        const outcome = await waitUntilSent(tabId);
        if (outcome === "sent") {
          await reportReply(token, job.reply_id, "sent");
          count.sent++;
          await endReplyInPage(tabId, false);
          await setPanel(tabId, `Câu ${index}/${total}: đã gửi.${queue.length > 0 ? " Đang chuyển sang câu kế..." : ""}`, "ok");
        } else if (outcome === "skipped") {
          await reportReply(token, job.reply_id, "skipped", "skipped_in_extension");
          count.skipped++;
          await endReplyInPage(tabId, true);
          await setPanel(tabId, `Câu ${index}/${total}: đã bỏ qua.${queue.length > 0 ? " Đang chuyển sang câu kế..." : ""}`, "info");
        } else {
          // Dừng, hết thời gian chờ, hoặc trang bị tải lại: không báo gì thêm. Câu ở trạng thái "Đã điền" trên webapp; lần quét sau
          // thấy câu trả lời thì tự ghi "Đã gửi", không thì sau 15 phút được giao lại.
          await endReplyInPage(tabId, false);
          note = outcome === "stopped" ? "Đã dừng theo yêu cầu. Câu đang điền vẫn nằm trong ô trả lời." : outcome === "timeout" ? "Chưa thấy câu trả lời được gửi sau 10 phút nên dừng ở đây." : "Trang Facebook đã tải lại nên không theo dõi tiếp được câu đang điền.";
          break;
        }
      }
      if (queue.length > 0 && !replyStop) await sleep(REPLY_GAP_MS);
    }
    if (replyStop && !note) note = "Đã dừng theo yêu cầu.";
    await store.setError(null);
  } catch (e) {
    if (e instanceof ApiError && e.isAuthFailure) {
      note = e.code === "TOKEN_REVOKED" ? "Mã kết nối đã bị thu hồi trên webapp." : e.message;
      await store.setError(note);
      await chrome.alarms.clear(ALARM);
    } else {
      note = errText(e);
    }
  } finally {
    clearInterval(keepAlive);
    const summary = `Trả lời bằng ${who}: ${count.sent} câu đã gửi, ${count.skipped} bỏ qua, ${count.failed} lỗi.${note ? " " + note : ""}`;
    await store.addEvent(count.failed > 0 || note ? "warn" : "ok", summary);
    if (tabId !== null) await setPanel(tabId, summary, count.failed > 0 || note ? "warn" : "ok");
    replyProgress = null;
    replyStop = false;
    running = false;
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
    const msg = errText(e);
    await store.addEvent("warn", `Theo dõi bài thất bại: ${msg}`);
    return { ok: false, message: msg };
  }
}

async function diagnoseActiveTab(tabId: number, deep = false): Promise<{ ok: boolean; message: string; report?: DiagnosticReport }> {
  const token = await store.getToken();
  const t = await activeFacebookTab(tabId);
  if (!t.ok) return t;
  let me: MeResponse | null = null;
  if (token) me = await api.me(token).catch(() => null);
  let report: DiagnosticReport;
  try {
    report = await sendToContent<DiagnosticReport>(tabId, { type: "DIAGNOSE", ownProfileUrl: me?.account.profile_url ?? "", ownDisplayName: me?.account.display_name ?? "", deep, pageNames: me?.pages ?? [] }, deep ? 10 * 60_000 : 40_000);
  } catch (e) {
    return { ok: false, message: `Không chạy được chẩn đoán trên tab này: ${errText(e)}` };
  }
  await store.setLastDiagnostic(report);
  if (token) await api.log(token, "scan_fail", { reason: "diagnostic", ...report }).catch(() => undefined);
  await store.addEvent("info", `${deep ? "Thử đọc sâu" : "Chẩn đoán"} trang ${report.host}: ${report.counts.articles} article, đọc được ${report.counts.commentsRead} comment (${report.counts.repliesRead} trả lời, ${report.counts.commentsWithPhone} có dạng số điện thoại)${token ? "; chỉ số đếm được gửi về webapp" : ""}.`);
  return { ok: true, message: `Đã chẩn đoán xong: ${report.counts.commentsRead} comment đọc được, ${report.counts.articles} khối article. Báo cáo đã lưu${token ? " và gửi về webapp" : ""}; bấm "Sao chép báo cáo" để gửi cho người phát triển.`, report };
}

/* ---------- Trạng thái ---------- */

async function getStatus(): Promise<StatusResponse> {
  const [lastCycle, progress, settings, alarm, token] = await Promise.all([store.getLastCycle(), store.getProgress(), store.getSettings(), chrome.alarms.get(ALARM), store.getToken()]);
  const base = { running, progress: running ? progress : null, replyProgress, replies: null, lastCycle, appOrigin: APP_ORIGIN, version: EXT_VERSION, settings, nextRunAt: alarm?.scheduledTime ? new Date(alarm.scheduledTime).toISOString() : null };
  if (!token) return { ...base, connected: false, error: await store.getError() };
  try {
    const me = await api.me(token);
    return { ...base, replies: me.replies ?? null, connected: true, user: me.user, account: me.account, error: await store.getError() };
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
    case "START_REPLIES": {
      if (running) return { started: false, message: replyProgress ? "Đang xử lý trả lời rồi. Xem tab Facebook vừa mở." : "Đang có một lần quét chạy. Chờ quét xong rồi bấm lại." };
      void runReplies(msg.group);
      return { started: true, message: `Đang mở bài trên Facebook. Extension điền sẵn từng câu ${msg.group === "page" ? "dưới tên fanpage" : "bằng nick"} rồi dừng lại; bạn đọc lại và tự bấm gửi.` };
    }
    case "STOP_REPLIES":
      replyStop = true;
      return { ok: true, message: "Sẽ dừng sau câu đang xử lý." } satisfies SimpleResult;
    case "FOLLOW_ACTIVE_TAB":
      return followActiveTab(msg.tabId);
    case "DIAGNOSE_ACTIVE_TAB":
      return diagnoseActiveTab(msg.tabId, msg.deep === true);
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
