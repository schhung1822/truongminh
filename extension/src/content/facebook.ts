/**
 * Content script chạy trên facebook.com. Chỉ làm khi background nhờ (tin nhắn SCAN hoặc GET_POST_INFO); không tự chạy gì.
 * Luồng quét một bài (docs/thiet-ke-module-lead-facebook.md mục 8.2): chờ trang tải, kiểm tra không phải trang đăng nhập/xác minh,
 * đổi bộ lọc sang "Tất cả bình luận", bấm "Xem thêm bình luận" và "Xem phản hồi" cho tới khi hết (có giới hạn), đọc từng comment.
 *
 * Giới hạn tốc độ nhằm tránh tạo tải bất thường lên tài khoản, KHÔNG nhằm che giấu việc tự động hoá: mọi độ trễ là số cố định.
 */
import type { ContentMessage, ScanResult } from "../types";
import { commentArticles, findClickable, mainPostArticle, pageState, postText, readAllComments, readPostInfo, seeMoreButtons, sleep, waitFor } from "./extract";
import { commentCountFromText, labelMatches } from "./selectors";

/** Chờ cố định sau mỗi lần bấm để trang kịp tải thêm nội dung. */
const STEP_DELAY_MS = 1000;
/** Số lần bấm mở rộng tối đa và thời gian tối đa cho một bài; vượt thì dừng và báo quét chưa trọn vẹn (complete=false). */
const MAX_STEPS = 80;
const MAX_MS = 3 * 60_000;
const PAGE_READY_TIMEOUT_MS = 20_000;

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

  let state = pageState();
  if (state !== "ok") return { state };
  const ready = await waitFor(() => document.querySelector('[role="article"]') !== null || pageState() !== "ok", PAGE_READY_TIMEOUT_MS);
  state = pageState();
  if (state !== "ok") return { state };
  if (!ready) return { state: "selector_broken", item: "post_article", detail: `Không thấy phần tử bài đăng sau ${PAGE_READY_TIMEOUT_MS / 1000} giây` };

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
    target.click();
    steps++;
    await sleep(STEP_DELAY_MS);
    const now = commentArticles().length;
    if (now > count) count = now;
    else dead.add(target);
  }

  // Mở phần nội dung bị cắt ngắn ("Xem thêm") của từng bình luận
  const more = seeMoreButtons();
  for (const b of more) b.click();
  if (more.length > 0) await sleep(STEP_DELAY_MS);

  const comments = readAllComments(own);
  if (comments.length === 0) {
    const post = mainPostArticle();
    if (!post) return { state: "selector_broken", item: "post_article", detail: "Không còn thấy phần bài đăng sau khi mở rộng" };
    const n = commentCountFromText(postText(post));
    // Bài báo có comment mà đọc ra 0: gần như chắc chắn Facebook đã đổi cấu trúc, không đoán mò
    if (n !== null && n > 0) return { state: "selector_broken", item: "comment_links", detail: `Bài báo ${n} bình luận nhưng không đọc được comment nào` };
    note = note ?? "Bài chưa có bình luận nào (hoặc nội dung không hiển thị với nick này).";
  }
  return { state: "ok", comments, complete, note };
}

declare global {
  interface Window {
    __tmLeadContent?: boolean;
  }
}

// Mỗi trang chỉ gắn bộ nghe tin một lần (đề phòng nạp lại content script)
if (!window.__tmLeadContent) {
  window.__tmLeadContent = true;
  chrome.runtime.onMessage.addListener((msg: ContentMessage, _sender, sendResponse) => {
    if (msg.type === "SCAN") {
      void scan(msg).then(sendResponse);
      return true; // trả lời bất đồng bộ
    }
    if (msg.type === "GET_POST_INFO") {
      sendResponse(readPostInfo());
      return false;
    }
    return false;
  });
}
