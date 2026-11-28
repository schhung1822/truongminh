/**
 * Luồng trả lời bán tự động trong MỘT trang bài đăng (v1.0 mục 8.3, v1.1 mục 5): tìm đúng comment theo mã, mở ô trả lời của
 * comment đó, chọn đúng danh tính (nick hoặc fanpage), điền câu đã được người duyệt trên webapp, tô viền ô nhập, rồi DỪNG.
 * Người dùng đọc lại, sửa nếu cần, và tự bấm gửi. Sau đó file này chỉ ĐỌC trang để biết câu trả lời đã xuất hiện hay chưa.
 *
 * File này không tự ghi vào ô nhập và không tự bấm nút nào: tìm comment (kèm bấm các nút mở rộng nội dung) là việc của
 * extract.ts; mở ô trả lời, chọn danh tính và điền chữ chỉ đi qua fill.ts (safeClick, insertReplyText) và identity.ts.
 * Không có bước nào gửi câu trả lời.
 */
import type { ContentMessage, FillResult, WaitResult } from "../types";
import { actAndWaitForDom } from "./dom-wait";
import { findCommentArticle, pageState, readAllComments, scrollToLoad, sleep, switchToAllComments, waitFor } from "./extract";
import { clearReplyText, EDITABLE, highlightBox, insertReplyText, labelOf, safeClick, visibleEditables } from "./fill";
import { ensureIdentity } from "./identity";
import { showPanel, type PanelAction } from "./reply-panel";
import { replyLabelMatches, sameName } from "./selectors";

type Own = { profileUrl: string; displayName: string };
type FillMsg = Extract<ContentMessage, { type: "REPLY_FILL" }>;

const PAGE_READY_TIMEOUT_MS = 25_000;
const CLICKABLE = '[role="button"], span[tabindex="0"], div[tabindex="0"], a[role="link"], a[role="button"]';

const isVisible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/** Câu đang chờ người bấm gửi. Chỉ giữ trong bộ nhớ của trang; tải lại trang là mất (background xử lý trường hợp đó). */
type Session = { box: HTMLElement; text: string; own: Own; replyNames: string[]; baseline: Set<string>; action: PanelAction | null };
let session: Session | null = null;

/** Mã các comment do mình viết (nick, hoặc một trong các tên đã cho) đang đọc được trên trang. */
function ownCommentIds(own: Own, names: string[]): Set<string> {
  const ids = new Set<string>();
  for (const c of readAllComments(own)) if (c.is_own || names.some((n) => sameName(c.author_name, n))) ids.add(c.fb_comment_id);
  return ids;
}

/** Nút "Phản hồi" thuộc chính bình luận này (không tính nút của bình luận con lồng bên trong). */
export function findReplyAction(article: HTMLElement): HTMLElement | null {
  const mine = (el: Element) => el.closest('[role="article"]') === article;
  return [...article.querySelectorAll<HTMLElement>(CLICKABLE)].find((el) => mine(el) && isVisible(el) && !el.closest("form") && replyLabelMatches(labelOf(el), "replyAction")) ?? null;
}

/**
 * Ô trả lời vừa mở cho bình luận này: ô đang được đặt con trỏ, hoặc ô mới xuất hiện sau khi bấm "Phản hồi", ưu tiên ô đứng
 * gần bình luận nhất và nằm phía dưới nó.
 */
function replyBoxFor(article: HTMLElement, before: Set<Element>): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.matches(EDITABLE) && isVisible(active) && !before.has(active)) return active;
  const fresh = visibleEditables().filter((b) => !before.has(b));
  if (fresh.length === 0) return null;
  const top = article.getBoundingClientRect().top;
  return fresh.sort((a, b) => Math.abs(a.getBoundingClientRect().top - top) - Math.abs(b.getBoundingClientRect().top - top))[0];
}

async function openReplyBox(article: HTMLElement): Promise<{ box: HTMLElement } | { fail: "reply_button_not_found" | "reply_box_not_found" }> {
  const action = findReplyAction(article);
  if (!action) return { fail: "reply_button_not_found" };
  const before = new Set<Element>(visibleEditables());
  action.scrollIntoView({ block: "center" });
  let clicked = false;
  await actAndWaitForDom(
    () => {
      clicked = safeClick(action, "reply_action");
    },
    { timeoutMs: 4_000, quietMs: 500 },
  );
  if (!clicked) return { fail: "reply_button_not_found" };
  const found: { box: HTMLElement | null } = { box: null };
  await waitFor(() => (found.box = replyBoxFor(article, before)) !== null, 6_000);
  return found.box ? { box: found.box } : { fail: "reply_box_not_found" };
}

function onPanelAction(a: PanelAction): void {
  if (session) session.action = a;
}

/** Tin REPLY_FILL: làm trọn các bước tới lúc câu đã nằm trong ô trả lời, rồi dừng. */
export async function fillReply(msg: FillMsg): Promise<FillResult> {
  endSession(false);
  const own: Own = { profileUrl: msg.ownProfileUrl, displayName: msg.ownDisplayName };
  let state = pageState();
  if (state !== "ok") return { state };
  const ready = await waitFor(() => document.querySelector('[role="article"], [data-ad-comet-preview="message"], [data-ad-preview="message"]') !== null || pageState() !== "ok", PAGE_READY_TIMEOUT_MS);
  state = pageState();
  if (state !== "ok") return { state };
  if (!ready) return { state: "failed", reason: "comment_not_found", item: "post_article", detail: "Không thấy phần tử bài đăng trên trang." };

  showPanel("Đang tìm comment cần trả lời trên bài này...", "info", false, null);
  await switchToAllComments();
  await scrollToLoad(2);
  const article = await findCommentArticle(msg.fbCommentId, own);
  if (!article) return { state: "failed", reason: "comment_not_found", item: "comment_article" };

  // Đã có trả lời của nick hoặc fanpage ngay dưới comment này: không điền thêm câu thứ hai
  const replyNames = msg.replyAs === "page" && msg.pageName ? [msg.pageName] : [];
  const ours = [...msg.pageNames, ...replyNames];
  const repliedByUs = readAllComments(own).some((c) => c.parent_fb_comment_id === msg.fbCommentId && (c.is_own || ours.some((n) => sameName(c.author_name, n))));
  if (repliedByUs) return { state: "already_replied" };

  article.scrollIntoView({ block: "center" });
  const opened = await openReplyBox(article);
  if ("fail" in opened) return { state: "failed", reason: opened.fail, item: opened.fail === "reply_button_not_found" ? "reply_action" : "reply_textbox" };
  let box = opened.box;

  const target = msg.replyAs === "page" ? (msg.pageName ?? "") : msg.ownDisplayName;
  if (msg.replyAs === "page" && !target) return { state: "failed", reason: "page_not_available", detail: "webapp không gửi tên fanpage" };
  const identity = await ensureIdentity({
    box,
    target,
    kind: msg.replyAs,
    others: msg.replyAs === "page" ? [msg.ownDisplayName, ...msg.pageNames.filter((n) => !sameName(n, target))] : msg.pageNames,
    // Facebook vẽ lại vùng soạn thảo sau khi đổi danh tính: lấy ô đang hiện gần bình luận, không có thì mở lại ô trả lời
    reacquireBox: async () => {
      const again = replyBoxFor(article, new Set());
      if (again) return again;
      const re = article.isConnected ? await openReplyBox(article) : { fail: "reply_box_not_found" as const };
      return "box" in re ? re.box : null;
    },
  });
  if (!identity.ok) return { state: "failed", reason: identity.reason, item: "identity_switcher", detail: identity.detail };
  box = identity.box;

  const baseline = ownCommentIds(own, ours);
  if (!(await insertReplyText(box, msg.text))) return { state: "failed", reason: "fill_failed", item: "reply_textbox_fill" };
  highlightBox(box, true);
  session = { box, text: msg.text, own, replyNames: ours, baseline, action: null };
  return { state: "filled" };
}

/** Tin REPLY_PANEL: background cập nhật bảng nhỏ (đang ở câu nào, đã xong...). */
export function showReplyPanel(text: string, tone: "info" | "ok" | "warn", buttons: boolean): void {
  showPanel(text, tone, buttons, buttons ? onPanelAction : null);
}

/**
 * Tin REPLY_WAIT: chờ tối đa `sliceMs` xem người dùng đã bấm gửi chưa. Chỉ ĐỌC trang: câu trả lời coi là đã gửi khi xuất hiện
 * một bình luận mới của nick / fanpage mà trước lúc điền chưa có. Hết lượt chờ thì trả "waiting" để background hỏi tiếp.
 */
export async function waitForSent(sliceMs: number): Promise<WaitResult> {
  const s = session;
  if (!s) return { state: "lost" };
  const end = Date.now() + Math.max(1_000, sliceMs);
  for (;;) {
    if (s.action === "skip") return { state: "skipped" };
    if (s.action === "stop") return { state: "stopped" };
    const now = ownCommentIds(s.own, s.replyNames);
    if ([...now].some((id) => !s.baseline.has(id))) return { state: "sent" };
    if (Date.now() >= end) return { state: "waiting" };
    await sleep(1_000);
  }
}

function endSession(clearBox: boolean): void {
  if (!session) return;
  highlightBox(session.box, false);
  if (clearBox) clearReplyText(session.box, session.text);
  session = null;
}

/** Tin REPLY_CANCEL: kết thúc việc theo dõi câu hiện tại (đã gửi, bỏ qua, hoặc dừng). `clearBox` = xoá chữ đã điền khi bỏ qua. */
export function cancelReply(clearBox: boolean): void {
  endSession(clearBox);
}
