/**
 * Đọc nội dung trang Facebook. File này CHỈ ĐỌC trang, cuộn trang, và bấm các nút mở rộng nội dung (Xem thêm bình luận,
 * Xem phản hồi, Xem thêm, menu sắp xếp). Không điền chữ, không bấm gửi/đăng/trả lời (có test chặn trong guard.test.ts).
 * Cách tìm phần tử nằm ở selectors.ts; Facebook đổi giao diện thì sửa ở đó.
 */
import { canonicalGroupUrl, isPostHref, parsePostUrl, profileUrlFromAnyLink } from "../../../lib/fb/urls";
import { extractContacts } from "../../../lib/fb/phone";
import { EXT_VERSION } from "../config";
import type { CommentPayload, DiagnosticReport, PostInfo } from "../types";
import {
  LABELS,
  authorFromCommentLabel,
  cleanCommentText,
  commentCountFromText,
  commentIdsFromHref,
  fallbackCommentId,
  isCheckpointUrl,
  isCommentLabel,
  isLoginUrl,
  isOwnComment,
  isUiNoise,
  labelMatches,
  linkPattern,
  looksLikeRelativeTime,
  type LabelKind,
} from "./selectors";

const CLICKABLE = '[role="button"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], span[tabindex="0"], div[tabindex="0"]';
const ARTICLE = '[role="article"]';
const MESSAGE = '[data-ad-comet-preview="message"], [data-ad-preview="message"]';

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Chờ điều kiện đúng, kiểm tra mỗi 500 ms (số cố định), tối đa `timeoutMs`. */
export async function waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (cond()) return true;
    await sleep(500);
  }
  return cond();
}

const isVisible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};
const textOf = (el: Element) => (el as HTMLElement).innerText ?? el.textContent ?? "";
const labelOf = (el: Element) => textOf(el).trim() || el.getAttribute("aria-label") || "";

export function pageState(): "ok" | "login" | "checkpoint" {
  if (isCheckpointUrl(location.href)) return "checkpoint";
  if (isLoginUrl(location.href) || document.querySelector('input[name="pass"], form[action*="/login"]')) return "login";
  return "ok";
}

/** Các nút (đang hiện) có nhãn thuộc loại `kind`, bỏ qua những nút trong `skip`. Nhãn nút luôn ngắn nên bỏ phần tử có chữ dài. */
export function findClickables(kind: LabelKind, opts: { root?: ParentNode; skip?: Set<Element> } = {}): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of (opts.root ?? document).querySelectorAll<HTMLElement>(CLICKABLE)) {
    if (opts.skip?.has(el) || !isVisible(el)) continue;
    const label = labelOf(el);
    if (label.length > 160) continue;
    if (labelMatches(label, kind)) out.push(el);
  }
  return out;
}

export const findClickable = (kind: LabelKind, skip?: Set<Element>) => findClickables(kind, { skip })[0] ?? null;

/* ---------- Bình luận ---------- */

const ownLevel = (article: Element) => (el: Element) => el.closest(ARTICLE) === article;

/** Các link nằm ngay trong chính article này (không tính article con lồng bên trong). */
function ownLinks(article: HTMLElement): HTMLAnchorElement[] {
  return [...article.querySelectorAll<HTMLAnchorElement>("a[href]")].filter(ownLevel(article));
}

function hasCommentId(href: string): boolean {
  return commentIdsFromHref(href) !== null;
}

/**
 * Link thời gian của bình luận: link có comment_id mà chữ là thời gian tương đối ("2 giờ"); dự phòng: link có comment_id
 * mà KHÔNG phải link trang cá nhân (link tên người viết trong Comet cũng có comment_id, phải loại ra).
 */
function timeLinkOf(article: HTMLElement): HTMLAnchorElement | null {
  const links = ownLinks(article).filter((a) => hasCommentId(a.href));
  return links.find((a) => looksLikeRelativeTime(textOf(a))) ?? links.find((a) => isPostHref(a.href) || profileUrlFromAnyLink(a.href) === null) ?? links[0] ?? null;
}

/** Link tên người viết: link trang cá nhân (không phải link bài), có chữ, chữ không phải thời gian. */
function authorLinkOf(article: HTMLElement, exclude: Element | null): HTMLAnchorElement | null {
  return ownLinks(article).find((a) => a !== exclude && !isPostHref(a.href) && profileUrlFromAnyLink(a.href) !== null && textOf(a).trim() !== "" && !looksLikeRelativeTime(textOf(a))) ?? null;
}

/** article là một bình luận: có link thời gian kèm comment_id, hoặc aria-label dạng "Bình luận của X". */
function isCommentArticle(a: HTMLElement): boolean {
  return timeLinkOf(a) !== null || isCommentLabel(a.getAttribute("aria-label"));
}

export function commentArticles(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(ARTICLE)].filter(isCommentArticle);
}

/** Nút "Xem thêm" của các bình luận bị cắt ngắn. Chỉ lấy nút nằm trong một bình luận. */
export function seeMoreButtons(): HTMLElement[] {
  return commentArticles().flatMap((a) => findClickables("seeMore", { root: a }));
}

export type ReadComment = CommentPayload & { fallbackId: boolean };

export function readComment(article: HTMLElement, own: { profileUrl: string; displayName: string }): ReadComment | null {
  const timeLink = timeLinkOf(article);
  const authorLink = authorLinkOf(article, timeLink);
  const label = article.getAttribute("aria-label");
  const authorName = (authorLink ? textOf(authorLink).trim() : "") || authorFromCommentLabel(label) || "";
  const authorUrl = authorLink ? profileUrlFromAnyLink(authorLink.href) : null;

  // Nội dung: các khối chữ (dir="auto") của riêng bình luận này, bỏ khối chứa tên người viết / link thời gian, lấy khối ngoài cùng
  const mine = ownLevel(article);
  const blocks = [...article.querySelectorAll<HTMLElement>('[dir="auto"]')].filter(
    (el) => mine(el) && !el.closest("a") && !el.closest('[role="button"]') && !(authorLink && el.contains(authorLink)) && !(timeLink && el.contains(timeLink)),
  );
  const outer = blocks.filter((el) => !blocks.some((o) => o !== el && o.contains(el)));
  let text = cleanCommentText(outer.map(textOf).join("\n"));
  if (!text) {
    // Dự phòng khi không có khối dir="auto": lấy chữ của article trừ chữ của các article con, bỏ tên người viết và nhãn giao diện
    const clone = article.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(ARTICLE).forEach((n) => n.remove());
    const lines = textOf(clone)
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l && l !== authorName && !isUiNoise(l));
    text = cleanCommentText(lines.join("\n"));
  }

  const ids = timeLink ? commentIdsFromHref(timeLink.href) : null;
  if (!ids && !text && !authorName) return null; // không phải bình luận đọc được
  const timeText = timeLink ? textOf(timeLink).trim().slice(0, 60) || null : (ownLinks(article).map((a) => textOf(a).trim()).find(looksLikeRelativeTime) ?? null);

  return {
    fb_comment_id: ids?.fbCommentId ?? fallbackCommentId(`${authorUrl ?? authorName}|${text}`),
    parent_fb_comment_id: ids?.parentFbCommentId ?? (article.parentElement?.closest(ARTICLE) ? "?" : null),
    author_name: authorName,
    author_profile_url: authorUrl ?? authorLink?.href ?? null,
    is_own: isOwnComment({ authorUrl, authorName, ownProfileUrl: own.profileUrl, ownDisplayName: own.displayName }),
    text,
    time_text: timeText,
    fallbackId: !ids,
  };
}

export function readAllComments(own: { profileUrl: string; displayName: string }): ReadComment[] {
  const byId = new Map<string, ReadComment>();
  for (const a of commentArticles()) {
    const c = readComment(a, own);
    if (c) byId.set(c.fb_comment_id, c);
  }
  // mã cha "?" (biết là trả lời nhưng không biết của ai) thì bỏ, server chỉ nhận mã thật
  return [...byId.values()].map((c) => (c.parent_fb_comment_id === "?" ? { ...c, parent_fb_comment_id: null } : c));
}

/* ---------- Bài chính ---------- */

/** Bài chính của trang permalink: article ngoài cùng (không nằm trong article khác) mà không phải một bình luận. */
export function mainPostArticle(): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(ARTICLE)].find((a) => !a.parentElement?.closest(ARTICLE) && !isCommentArticle(a)) ?? null;
}

/** Vùng chứa bài chính, có dự phòng khi Facebook không đánh dấu role="article": khối chứa nội dung bài, rồi vùng main, rồi cả trang. */
export function mainPostRoot(): HTMLElement {
  return mainPostArticle() ?? document.querySelector<HTMLElement>(MESSAGE)?.closest<HTMLElement>("div[aria-posinset], [role=\"main\"]") ?? document.querySelector<HTMLElement>('[role="main"]') ?? document.body;
}

export function postText(root: HTMLElement): string {
  return textOf(root);
}

/**
 * Tổng comment Facebook công bố cho bài. Ưu tiên toàn vùng dialog vì số tổng thường nằm ở thanh tương tác ngoài article;
 * đọc cả aria-label/title vì giao diện có thể chỉ hiện chữ số cạnh biểu tượng comment.
 */
export function pageCommentCount(root: HTMLElement = mainPostRoot()): number | null {
  const scope = root.closest<HTMLElement>('[role="dialog"]') ?? root;
  const counts: number[] = [];
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    const count = commentCountFromText(raw);
    if (count !== null) counts.push(count);
  };
  add(textOf(scope));
  for (const el of scope.querySelectorAll<HTMLElement>("[aria-label], [title]")) {
    add(el.getAttribute("aria-label"));
    add(el.getAttribute("title"));
  }
  return counts.length > 0 ? Math.max(...counts) : null;
}

/** Link tên tác giả của bài chính: ưu tiên chỗ Facebook đánh dấu tên, rồi tiêu đề h2/h3/h4 hoặc chữ đậm, rồi link trang cá nhân đầu tiên trong bài. */
export function postAuthorLink(root: HTMLElement): HTMLAnchorElement | null {
  const mine = root.matches(ARTICLE) ? ownLevel(root) : () => true;
  const ok = (a: HTMLAnchorElement) => mine(a) && textOf(a).trim() !== "" && !isPostHref(a.href) && profileUrlFromAnyLink(a.href) !== null && !looksLikeRelativeTime(textOf(a));
  const tiers = [
    '[data-ad-rendering-role="profile_name"] a[href]',
    "h2 a[href], h3 a[href], h4 a[href], strong a[href], b a[href]",
    "a[href]",
  ];
  for (const sel of tiers) {
    const found = [...root.querySelectorAll<HTMLAnchorElement>(sel)].find((a) => ok(a) && !a.closest(ARTICLE + " " + ARTICLE));
    if (found) return found;
  }
  return null;
}

/** Thông tin bài đang mở cho nút "Theo dõi bài này". Tác giả là metadata tùy chọn; permalink mới là điều bắt buộc. */
export function readPostInfo(): PostInfo {
  const parsed = parsePostUrl(location.href);
  if (!parsed) {
    return { ok: false, error: "Trang này không phải link của một bài đăng. Mở bài ở trang riêng của nó (bấm vào thời gian đăng của bài) rồi bấm lại." };
  }
  if (!mainPostArticle() && !document.querySelector(MESSAGE)) {
    return { ok: false, error: "Chưa thấy nội dung bài đăng trên trang. Hãy chờ Facebook tải xong hoặc tải lại trang (F5), rồi bấm lại." };
  }
  const root = mainPostRoot();
  const author = postAuthorLink(root);

  const groupLink = [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/groups/"]')].map((a) => canonicalGroupUrl(a.href)).find((u) => u !== null) ?? null;
  const message = root.querySelector<HTMLElement>(MESSAGE);
  return {
    ok: true,
    url: parsed.url,
    authorProfileUrl: author ? profileUrlFromAnyLink(author.href) : null,
    authorName: author ? textOf(author).trim() || null : null,
    groupUrl: parsed.groupUrl ?? groupLink,
    content: (message ? textOf(message) : "").trim().slice(0, 2000),
  };
}

/* ---------- Cuộn để Facebook vẽ nốt phần bình luận ---------- */

/** Vùng cuộn thật chứa comment. Bài mở dạng dialog thường cuộn một div riêng, không cuộn window. */
export function commentScrollContainer(): HTMLElement | null {
  const seeds = [mainPostRoot(), ...commentArticles()];
  const coverage = new Map<HTMLElement, number>();
  for (const seed of seeds) {
    let parent = seed.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      const style = getComputedStyle(parent);
      const canScroll = parent.scrollHeight > parent.clientHeight + 40 && /(auto|scroll|overlay)/i.test(style.overflowY);
      if (canScroll) coverage.set(parent, (coverage.get(parent) ?? 0) + 1);
      parent = parent.parentElement;
    }
  }
  return [...coverage].sort((a, b) => b[1] - a[1] || b[0].scrollHeight - b[0].clientHeight - (a[0].scrollHeight - a[0].clientHeight))[0]?.[0] ?? null;
}

/** Cuộn vùng comment tới một vị trí; trình duyệt tự phát sự kiện scroll khi scrollTop thay đổi. */
export function scrollCommentArea(position: "top" | "middle" | "bottom"): void {
  const container = commentScrollContainer();
  if (container) {
    const max = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = position === "top" ? 0 : position === "middle" ? Math.round(max / 2) : max;
    return;
  }
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  window.scrollTo({ top: position === "top" ? 0 : position === "middle" ? Math.round(max / 2) : max, behavior: "auto" });
}

/** Cuộn xuống cuối trang vài lần (chờ cố định 700 ms mỗi lần) rồi đưa bình luận cuối vào khung nhìn. Facebook vẽ bình luận theo khung nhìn. */
export async function scrollToLoad(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    scrollCommentArea("bottom");
    await sleep(700);
  }
  const all = commentArticles();
  all.at(-1)?.scrollIntoView({ block: "end" });
  await sleep(500);
}

/* ---------- Chẩn đoán ---------- */

const summarizeStructure = (a: HTMLElement): string => {
  const parts: string[] = [];
  const tl = timeLinkOf(a);
  const al = authorLinkOf(a, tl);
  parts.push(`aria-label=${a.getAttribute("aria-label") ? "có" : "không"}`);
  parts.push(`timeLink=${tl ? linkPattern(tl.href) : "không"}`);
  parts.push(`authorLink=${al ? linkPattern(al.href) : "không"}`);
  parts.push(`dirAutoBlocks=${a.querySelectorAll('[dir="auto"]').length}`);
  parts.push(`nestedArticles=${a.querySelectorAll(ARTICLE).length}`);
  parts.push(`links=${ownLinks(a).length}`);
  return parts.join(" ");
};

/** Báo cáo cấu trúc trang, không chứa dữ liệu cá nhân (xem DiagnosticReport). `observedComments` dùng số đếm đã gom qua nhiều lát DOM. */
export function diagnose(own: { profileUrl: string; displayName: string }, deep: DiagnosticReport["deep"] = null, observedComments: ReadComment[] | null = null): DiagnosticReport {
  const articles = [...document.querySelectorAll<HTMLElement>(ARTICLE)];
  const comments = observedComments ?? readAllComments(own);
  const buttons: Record<string, string[]> = {};
  for (const kind of Object.keys(LABELS) as LabelKind[]) {
    const labels = findClickables(kind).map((b) => labelOf(b).split(/\r?\n/)[0].trim().slice(0, 40));
    if (labels.length) buttons[kind] = [...new Set(labels)].slice(0, 5);
  }
  const sort = findClickable("sortButton");
  const root = mainPostRoot();
  const countText = /(\d[\d.,]*\s*[kKmM]?\s*(?:bình luận|binh luan|comments?))/i.exec(postText(root))?.[1] ?? null;
  const labelPatterns = [...new Set(articles.map((a) => (a.getAttribute("aria-label") ?? "").replace(/\s.*$/u, "").slice(0, 20)).filter(Boolean))].slice(0, 8);
  const linkPatterns = [...new Set([...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((a) => linkPattern(a.href)))].filter((p) => /comment_id|posts|permalink|photo|groups|profile/.test(p)).slice(0, 25);
  const sample = articles.filter(isCommentArticle).slice(0, 3).map(summarizeStructure);
  return {
    at: new Date().toISOString(),
    url: location.href.replace(/\?.*$/, ""),
    host: location.hostname,
    visibility: document.visibilityState,
    pageState: pageState(),
    isPostUrl: parsePostUrl(location.href) !== null,
    counts: {
      articles: articles.length,
      articlesWithCommentLink: articles.filter((a) => timeLinkOf(a) !== null).length,
      articlesWithCommentLabel: articles.filter((a) => isCommentLabel(a.getAttribute("aria-label"))).length,
      commentsRead: comments.length,
      commentsWithFallbackId: comments.filter((c) => c.fallbackId).length,
      ownComments: comments.filter((c) => c.is_own).length,
      repliesRead: comments.filter((c) => c.parent_fb_comment_id !== null).length,
      commentsWithPhone: comments.filter((c) => extractContacts(c.text).phones.length > 0).length,
    },
    deep,
    buttons,
    sortButtonLabel: sort ? labelOf(sort).split(/\r?\n/)[0].slice(0, 40) : null,
    commentCountText: countText,
    postAuthorFound: postAuthorLink(root) !== null,
    mainPostFound: mainPostArticle() !== null,
    articleLabelPatterns: labelPatterns,
    linkPatterns,
    sampleCommentStructure: sample,
    extensionVersion: EXT_VERSION,
  };
}
