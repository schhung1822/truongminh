/**
 * Content script chạy trên facebook.com (mọi host con: www, web, m). Chỉ làm khi background nhờ (PING, SCAN, GET_POST_INFO,
 * DIAGNOSE, và các tin REPLY_* của luồng điền sẵn câu trả lời, xem reply.ts); không tự chạy gì. Luồng quét một bài (docs/thiet-ke-module-lead-facebook.md mục 8.2): chờ trang tải, kiểm tra
 * không phải trang đăng nhập/xác minh, cuộn để Facebook vẽ bình luận, đổi bộ lọc sang "Tất cả bình luận", bấm "Xem thêm
 * bình luận" và "Xem phản hồi" cho tới khi hết (có giới hạn), đọc từng comment.
 *
 * Giới hạn tốc độ nhằm tránh tạo tải bất thường lên tài khoản, KHÔNG nhằm che giấu việc tự động hoá: mọi độ trễ là số cố định.
 */
import type { CommentCountResult, ContentMessage, ScanResult } from "../types";
import { hasReliableCoverage } from "../scan-policy";
import { CommentCollector } from "./comment-collector";
import { actAndWaitForDom } from "./dom-wait";
import { commentArticles, diagnose, findClickable, mainPostRoot, pageCommentCount, pageState, readAllComments, readPostInfo, scrollCommentArea, scrollToLoad, seeMoreButtons, switchToAllComments, waitFor, type ReadComment } from "./extract";
import { cancelReply, fillReply, showReplyPanel, waitForSent } from "./reply";
import { diagnoseReply } from "./reply-diagnose";

/** Bài lớn được thêm thời gian và lượt mở rộng, nhưng vẫn có trần để không tạo tải bất thường lên tài khoản. */
const SMALL_SCAN = { maxSteps: 160, maxMs: 5 * 60_000 };
const LARGE_SCAN = { maxSteps: 300, maxMs: 8 * 60_000 };
const LARGE_POST_COMMENTS = 100;
const MAX_COMMENTS_PER_SCAN = 3_000; // khớp giới hạn của API /comments
const STABLE_ROUNDS = 3;
const EXPANSION_WAIT_MS = 5_000;
const PAGE_READY_TIMEOUT_MS = 25_000;

type OwnAccount = { profileUrl: string; displayName: string };
type ExpansionResult = { complete: boolean; steps: number; stableRounds: number; comments: ReadComment[]; note?: string };

const captureVisible = (collector: CommentCollector, own: OwnAccount) => collector.addAll(readAllComments(own));

/** Mở phần chữ bị cắt trước khi chụp lát DOM hiện tại, để mã tạm không được tạo từ nội dung thiếu. */
async function captureVisibleFully(collector: CommentCollector, own: OwnAccount, expandedText: WeakSet<Element>): Promise<number> {
  const before = collector.size;
  const more = seeMoreButtons().filter((button) => !expandedText.has(button));
  if (more.length > 0) {
    for (const button of more) expandedText.add(button);
    await actAndWaitForDom(
      () => more.forEach((button) => button.click()),
      { timeoutMs: 2_500, quietMs: 400, onMutation: () => captureVisible(collector, own) },
    );
    collector.addAll(readAllComments(own), { mergeExpandedFallbacks: true });
  } else {
    captureVisible(collector, own);
  }
  return collector.size - before;
}

/** Cuộn qua các vùng đang có comment để Facebook vẽ lại những lát DOM đã bị virtualization. */
async function sweepVisible(collector: CommentCollector, own: OwnAccount, expandedText: WeakSet<Element>): Promise<number> {
  const before = collector.size;
  for (const position of ["top", "middle", "bottom"] as const) {
    await actAndWaitForDom(
      () => scrollCommentArea(position),
      { timeoutMs: 1_500, quietMs: 400, onMutation: () => captureVisible(collector, own) },
    );
    await captureVisibleFully(collector, own, expandedText);
  }
  const articles = commentArticles();
  const points = [mainPostRoot(), articles[0], articles[Math.floor(articles.length / 2)], articles.at(-1)].filter((el, index, all): el is HTMLElement => !!el && all.indexOf(el) === index);
  for (const point of points) {
    await actAndWaitForDom(
      () => point.scrollIntoView({ block: point === points[0] ? "start" : "center" }),
      { timeoutMs: 1_200, quietMs: 350, onMutation: () => captureVisible(collector, own) },
    );
    await captureVisibleFully(collector, own, expandedText);
  }
  await scrollToLoad(1);
  await captureVisibleFully(collector, own, expandedText);
  return collector.size - before;
}

/** Bấm các nút mở rộng cho tới khi hết, đồng thời cộng dồn từng lát DOM thay vì chỉ đọc một lần ở cuối. */
async function expandAll(started: number, own: OwnAccount, reportedCount: number | null): Promise<ExpansionResult> {
  const limits = (reportedCount ?? 0) > LARGE_POST_COMMENTS ? LARGE_SCAN : SMALL_SCAN;
  const collector = new CommentCollector();
  const expandedText = new WeakSet<Element>();
  // Nút không sinh thêm comment sau hai lần thử mới bị bỏ qua; Facebook có lúc phản hồi chậm hơn một giây.
  const dead = new Set<Element>();
  const failedAttempts = new WeakMap<Element, number>();
  let steps = 0;
  let stableRounds = 0;
  let complete = true;
  let note: string | undefined;

  await captureVisibleFully(collector, own, expandedText);
  // Chụp lại sau từng vòng cuộn ban đầu để không mất comment đã bị Facebook gỡ khỏi DOM ở vòng sau.
  for (let i = 0; i < 4; i++) {
    await scrollToLoad(1);
    await captureVisibleFully(collector, own, expandedText);
  }

  for (;;) {
    if (collector.size >= MAX_COMMENTS_PER_SCAN) {
      complete = false;
      note = `Dừng ở giới hạn ${MAX_COMMENTS_PER_SCAN} comment của một lần gửi; chu kỳ sau sẽ quét lại.`;
      break;
    }
    if (Date.now() - started > limits.maxMs || steps >= limits.maxSteps) {
      complete = false;
      note = "Dừng vì quá giới hạn thời gian hoặc số lần mở rộng; chu kỳ sau sẽ quét lại.";
      break;
    }

    await captureVisibleFully(collector, own, expandedText);
    const target = findClickable("viewMoreComments", dead) ?? findClickable("viewReplies", dead);
    if (target) {
      stableRounds = 0;
      const before = collector.size;
      await actAndWaitForDom(
        () => {
          target.scrollIntoView({ block: "center" });
          target.click();
        },
        { timeoutMs: EXPANSION_WAIT_MS, quietMs: 700, onMutation: () => captureVisible(collector, own) },
      );
      steps++;
      await captureVisibleFully(collector, own, expandedText);
      if (collector.size > before) {
        failedAttempts.delete(target);
      } else {
        const failures = (failedAttempts.get(target) ?? 0) + 1;
        failedAttempts.set(target, failures);
        if (failures >= 2 || !target.isConnected) dead.add(target);
      }
      if (steps % 10 === 0) await sweepVisible(collector, own, expandedText);
      continue;
    }

    const added = await sweepVisible(collector, own, expandedText);
    const appeared = findClickable("viewMoreComments", dead) ?? findClickable("viewReplies", dead);
    if (added > 0 || appeared) stableRounds = 0;
    else stableRounds++;
    const neededStableRounds = collector.size === 0 && (reportedCount ?? 0) === 0 ? 1 : STABLE_ROUNDS;
    if (stableRounds >= neededStableRounds) break;
  }

  await captureVisibleFully(collector, own, expandedText);
  const comments = collector.values().slice(0, MAX_COMMENTS_PER_SCAN);
  if (reportedCount !== null && comments.length < reportedCount) {
    const gap = `Facebook báo ${reportedCount} bình luận, bộ đọc giữ được ${comments.length}; phần chênh có thể là bình luận bị ẩn/xóa hoặc Facebook chưa hiển thị cho nick này.`;
    note = `${note ? note + " " : ""}${gap}`;
    // Không lưu mốc tổng để bỏ qua các vòng sau nếu mới đọc được một phần nhỏ (ví dụ 10/75).
    if (!hasReliableCoverage(comments.length, reportedCount)) complete = false;
  }
  return { complete, steps, stableRounds, comments, note };
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

  await switchToAllComments();

  const reportedCount = pageCommentCount();
  const exp = await expandAll(started, own, reportedCount);
  const complete = exp.complete;
  let note = exp.note;

  const comments = exp.comments;
  const fallback = comments.filter((c) => c.fallbackId).length;
  if (fallback > 0) note = `${note ? note + " " : ""}${fallback}/${comments.length} comment dùng mã tạm vì không thấy link thời gian có comment_id.`;

  if (comments.length === 0) {
    const n = pageCommentCount();
    // Bài báo có comment mà đọc ra 0: gần như chắc chắn Facebook đã đổi cấu trúc, không đoán mò
    if (n !== null && n > 0) {
      return { state: "selector_broken", item: "comment_articles", detail: `Bài báo ${n} bình luận nhưng không đọc được comment nào (host ${location.hostname}, trang ${document.visibilityState}, ${document.querySelectorAll('[role="article"]').length} article)`, resolvedUrl };
    }
    note = note ?? "Không thấy bình luận nào trên trang (bài chưa có bình luận, hoặc nội dung không hiển thị với nick này).";
  }
  return { state: "ok", comments: comments.map((c) => ({ fb_comment_id: c.fb_comment_id, parent_fb_comment_id: c.parent_fb_comment_id, author_name: c.author_name, author_profile_url: c.author_profile_url, is_own: c.is_own, text: c.text, time_text: c.time_text })), complete, reportedCount, note: note?.slice(0, 300), resolvedUrl };
}

/** Đọc nhanh tổng comment ở tab nền; không cuộn và không mở rộng nội dung. */
async function readCommentCount(): Promise<CommentCountResult> {
  const resolvedUrl = location.href;
  let state = pageState();
  if (state !== "ok") return { state };
  const ready = await waitFor(
    () => document.querySelector('[role="article"], [data-ad-comet-preview="message"], [data-ad-preview="message"]') !== null || pageState() !== "ok",
    PAGE_READY_TIMEOUT_MS,
  );
  state = pageState();
  if (state !== "ok") return { state };
  if (!ready) return { state: "selector_broken", item: "post_article", detail: "Không thấy phần tử bài đăng khi đọc nhanh tổng comment.", resolvedUrl };
  await waitFor(() => pageCommentCount() !== null || pageState() !== "ok", 8_000);
  state = pageState();
  if (state !== "ok") return { state };
  return { state: "ok", count: pageCommentCount(), resolvedUrl };
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
      case "GET_COMMENT_COUNT":
        void readCommentCount().then(sendResponse, (e: unknown) => sendResponse({ state: "selector_broken", item: "count_error", detail: String((e as Error)?.message ?? e), resolvedUrl: location.href }));
        return true;
      case "GET_POST_INFO":
        sendResponse(readPostInfo());
        return false;
      case "REPLY_FILL":
        void fillReply(msg).then(sendResponse, (e: unknown) => sendResponse({ state: "failed", reason: "fill_failed", detail: String((e as Error)?.message ?? e).slice(0, 200) }));
        return true;
      case "REPLY_WAIT":
        void waitForSent(msg.sliceMs).then(sendResponse, () => sendResponse({ state: "lost" }));
        return true;
      case "REPLY_PANEL":
        showReplyPanel(msg.text, msg.tone, msg.buttons);
        sendResponse({ ok: true });
        return false;
      case "REPLY_CANCEL":
        cancelReply(msg.clearBox);
        sendResponse({ ok: true });
        return false;
      case "DIAGNOSE": {
        const own = { profileUrl: msg.ownProfileUrl, displayName: msg.ownDisplayName };
        const known = { nick: msg.ownDisplayName, pages: msg.pageNames ?? [] };
        void (async () => {
          await scrollToLoad(2);
          if (!msg.deep) return sendResponse({ ...diagnose(own), reply: diagnoseReply(known) });
          // Thử đọc sâu: chạy đúng bộ gom cuốn chiếu, nhưng báo cáo chỉ giữ số đếm (không gửi dữ liệu comment ra ngoài trang)
          const t0 = Date.now();
          await switchToAllComments();
          const reportedCount = pageCommentCount();
          const exp = await expandAll(t0, own, reportedCount);
          sendResponse({ ...diagnose(own, { expanded: true, steps: exp.steps, complete: exp.complete, seconds: Math.round((Date.now() - t0) / 1000), stableRounds: exp.stableRounds, reportedCount }, exp.comments), reply: diagnoseReply(known) });
        })();
        return true;
      }
    }
    return false;
  });
}
