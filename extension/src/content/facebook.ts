/**
 * Content script chạy trên facebook.com (mọi host con: www, web, m). Chỉ làm khi background nhờ (PING, SCAN, GET_POST_INFO,
 * DIAGNOSE); không tự chạy gì. Luồng quét một bài (docs/thiet-ke-module-lead-facebook.md mục 8.2): chờ trang tải, kiểm tra
 * không phải trang đăng nhập/xác minh, cuộn để Facebook vẽ bình luận, đổi bộ lọc sang "Tất cả bình luận", bấm "Xem thêm
 * bình luận" và "Xem phản hồi" cho tới khi hết (có giới hạn), đọc từng comment.
 *
 * Giới hạn tốc độ nhằm tránh tạo tải bất thường lên tài khoản, KHÔNG nhằm che giấu việc tự động hoá: mọi độ trễ là số cố định.
 */
import type { ContentMessage, ScanResult } from "../types";
import { commentArticles, diagnose, findClickable, mainPostRoot, pageState, postText, readAllComments, readPostInfo, scrollToLoad, seeMoreButtons, sleep, waitFor } from "./extract";
import { commentCountFromText, labelMatches } from "./selectors";

/** Chờ cố định sau mỗi lần bấm để trang kịp tải thêm nội dung. */
const STEP_DELAY_MS = 1000;
/** Số lần bấm mở rộng tối đa và thời gian tối đa cho một bài; vượt thì dừng và báo quét chưa trọn vẹn (complete=false). */
const MAX_STEPS = 80;
const MAX_MS = 3 * 60_000;
const PAGE_READY_TIMEOUT_MS = 25_000;

/** Đổi bộ lọc bình luận sang "Tất cả bình luận". Cố gắng hết sức: không thấy menu thì bỏ qua (bài ít comment có thể không có menu). */
async function switchToAllComments(): Promise<void> {
  const sort = findClickable("sortButton");
  if (!sort) return;
  const current = (sort.innerText || sort.getAttribute("aria-label") || "").trim();
  if (labelMatches(current, "allComments")) return;
  sort.click();
  await sleep(STEP_DELAY_MS);
  const item = findClickable("allComments");
  if (item) {
    item.click();
    await sleep(STEP_DELAY_MS * 2);
  }
}

async function scan(msg: Extract<ContentMessage, { type: "SCAN" }>): Promise<ScanResult> {
  const started = Date.now();
  const own = { profileUrl: msg.ownProfileUrl, displayName: msg.ownDisplayName };
  const resolvedUrl = location.href;

  let state = pageState();
  if (state !== "ok") return { state };
  // Trang vẽ xong khi có bài (article) hoặc có nội dung bài, hoặc có bất kỳ nút nào về bình luận
  const ready = await waitFor(
    () => document.querySelector('[role="article"], [data-ad-comet-preview="message"], [data-ad-preview="message"]') !== null || pageState() !== "ok",
    PAGE_READY_TIMEOUT_MS,
  );
  state = pageState();
  if (state !== "ok") return { state };
  if (!ready) return { state: "selector_broken", item: "post_article", detail: `Không thấy phần tử bài đăng sau ${PAGE_READY_TIMEOUT_MS / 1000} giây (host ${location.hostname}, trang ${document.visibilityState})`, resolvedUrl };

  await scrollToLoad();
  await switchToAllComments();

  // Mở rộng: nút nào bấm xong mà số comment không tăng thì ghi là "chết" và bỏ qua, tránh bấm lặp mãi một nút
  const dead = new Set<Element>();
  let steps = 0;
  let count = commentArticles().length;
  let complete = true;
  let note: string | undefined;
  for (;;) {
    if (Date.now() - started > MAX_MS || steps >= MAX_STEPS) {
      complete = false;
      note = "Dừng vì quá giới hạn thời gian hoặc số lần mở rộng; chu kỳ sau sẽ quét lại.";
      break;
    }
    const target = findClickable("viewMoreComments", dead) ?? findClickable("viewReplies", dead);
    if (!target) break;
    target.scrollIntoView({ block: "center" });
    target.click();
    steps++;
    await sleep(STEP_DELAY_MS);
    const now = commentArticles().length;
    if (now > count) count = now;
    else dead.add(target);
    if (steps % 10 === 0) await scrollToLoad(1);
  }

  // Mở phần nội dung bị cắt ngắn ("Xem thêm") của từng bình luận
  const more = seeMoreButtons();
  for (const b of more) b.click();
  if (more.length > 0) await sleep(STEP_DELAY_MS);

  const comments = readAllComments(own);
  const fallback = comments.filter((c) => c.fallbackId).length;
  if (fallback > 0) note = `${note ? note + " " : ""}${fallback}/${comments.length} comment dùng mã tạm vì không thấy link thời gian có comment_id.`;

  if (comments.length === 0) {
    const n = commentCountFromText(postText(mainPostRoot()));
    // Bài báo có comment mà đọc ra 0: gần như chắc chắn Facebook đã đổi cấu trúc, không đoán mò
    if (n !== null && n > 0) {
      return { state: "selector_broken", item: "comment_articles", detail: `Bài báo ${n} bình luận nhưng không đọc được comment nào (host ${location.hostname}, trang ${document.visibilityState}, ${document.querySelectorAll('[role="article"]').length} article)`, resolvedUrl };
    }
    note = note ?? "Không thấy bình luận nào trên trang (bài chưa có bình luận, hoặc nội dung không hiển thị với nick này).";
  }
  return { state: "ok", comments: comments.map((c) => ({ fb_comment_id: c.fb_comment_id, parent_fb_comment_id: c.parent_fb_comment_id, author_name: c.author_name, author_profile_url: c.author_profile_url, is_own: c.is_own, text: c.text, time_text: c.time_text })), complete, note, resolvedUrl };
}

declare global {
  interface Window {
    __dataLeadContent?: boolean;
  }
}

// Mỗi trang chỉ gắn bộ nghe tin một lần (đề phòng nạp lại content script, kể cả khi background nạp bổ sung bằng scripting)
if (!window.__dataLeadContent) {
  window.__dataLeadContent = true;
  chrome.runtime.onMessage.addListener((msg: ContentMessage, _sender, sendResponse) => {
    switch (msg.type) {
      case "PING":
        sendResponse({ ok: true, href: location.href, visibility: document.visibilityState });
        return false;
      case "SCAN":
        void scan(msg).then(sendResponse, (e: unknown) => sendResponse({ state: "selector_broken", item: "scan_error", detail: String((e as Error)?.message ?? e), resolvedUrl: location.href }));
        return true; // trả lời bất đồng bộ
      case "GET_POST_INFO":
        sendResponse(readPostInfo());
        return false;
      case "DIAGNOSE":
        void scrollToLoad(2).then(() => sendResponse(diagnose({ profileUrl: msg.ownProfileUrl, displayName: msg.ownDisplayName })));
        return true;
    }
    return false;
  });
}
