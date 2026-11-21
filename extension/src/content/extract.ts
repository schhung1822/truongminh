/**
 * Đọc nội dung trang Facebook. File này CHỈ ĐỌC trang và bấm các nút mở rộng nội dung (Xem thêm bình luận, Xem phản hồi,
 * Xem thêm, menu sắp xếp). Không điền chữ, không bấm gửi/đăng/trả lời (có test chặn trong guard.test.ts).
 * Cách tìm phần tử nằm ở selectors.ts; Facebook đổi giao diện thì sửa ở đó.
 */
import { canonicalGroupUrl, parsePostUrl, profileUrlFromAnyLink } from "../../../lib/fb/urls";
import type { CommentPayload, PostInfo } from "../types";
import { cleanCommentText, commentIdsFromHref, isCheckpointUrl, isLoginUrl, isOwnComment, labelMatches, type LabelKind } from "./selectors";

const CLICKABLE = '[role="button"], [role="menuitem"], [role="menuitemradio"], [role="option"], span[tabindex="0"], div[tabindex="0"]';
const ARTICLE = '[role="article"]';

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
    const label = textOf(el).trim() || el.getAttribute("aria-label") || "";
    if (label.length > 80) continue;
    if (labelMatches(label, kind)) out.push(el);
  }
  return out;
}

export const findClickable = (kind: LabelKind, skip?: Set<Element>) => findClickables(kind, { skip })[0] ?? null;

/** Comment có link thời gian riêng (tham số comment_id) nằm ngay trong chính phần tử article của nó, không tính article lồng bên trong. */
function ownTimeLink(article: HTMLElement): HTMLAnchorElement | null {
  for (const a of article.querySelectorAll<HTMLAnchorElement>('a[href*="comment_id="]')) {
    if (a.closest(ARTICLE) === article) return a;
  }
  return null;
}

export function commentArticles(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(ARTICLE)].filter((a) => ownTimeLink(a) !== null);
}

/** Nút "Xem thêm" của các bình luận bị cắt ngắn. Chỉ lấy nút nằm trong một bình luận. */
export function seeMoreButtons(): HTMLElement[] {
  return commentArticles().flatMap((a) => findClickables("seeMore", { root: a }));
}

export function readComment(article: HTMLElement, own: { profileUrl: string; displayName: string }): CommentPayload | null {
  const timeLink = ownTimeLink(article);
  if (!timeLink) return null;
  const ids = commentIdsFromHref(timeLink.href);
  if (!ids) return null;

  const ownLevel = (el: Element) => el.closest(ARTICLE) === article;
  const authorLink =
    [...article.querySelectorAll<HTMLAnchorElement>("a[href]")].find(
      (a) => a !== timeLink && ownLevel(a) && textOf(a).trim() !== "" && profileUrlFromAnyLink(a.href) !== null,
    ) ?? null;
  const authorName = authorLink ? textOf(authorLink).trim() : "";
  const authorUrl = authorLink ? profileUrlFromAnyLink(authorLink.href) : null;

  // Nội dung: các khối chữ (dir="auto") của riêng bình luận này, bỏ khối chứa tên người viết / link thời gian, lấy khối ngoài cùng
  const blocks = [...article.querySelectorAll<HTMLElement>('[dir="auto"]')].filter(
    (el) => ownLevel(el) && !el.closest("a") && !el.closest('[role="button"]') && !(authorLink && el.contains(authorLink)) && !el.contains(timeLink),
  );
  const outer = blocks.filter((el) => !blocks.some((o) => o !== el && o.contains(el)));
  const text = cleanCommentText(outer.map(textOf).join("\n"));

  return {
    fb_comment_id: ids.fbCommentId,
    parent_fb_comment_id: ids.parentFbCommentId,
    author_name: authorName,
    author_profile_url: authorUrl ?? authorLink?.href ?? null,
    is_own: isOwnComment({ authorUrl, authorName, ownProfileUrl: own.profileUrl, ownDisplayName: own.displayName }),
    text,
    time_text: textOf(timeLink).trim().slice(0, 60) || null,
  };
}

export function readAllComments(own: { profileUrl: string; displayName: string }): CommentPayload[] {
  const byId = new Map<string, CommentPayload>();
  for (const a of commentArticles()) {
    const c = readComment(a, own);
    if (c) byId.set(c.fb_comment_id, c);
  }
  return [...byId.values()];
}

/** Bài chính của trang permalink: article ngoài cùng (không nằm trong article khác). */
export function mainPostArticle(): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(ARTICLE)].find((a) => !a.parentElement?.closest(ARTICLE)) ?? null;
}

export function postText(post: HTMLElement): string {
  return textOf(post);
}

/**
 * Thông tin bài đang mở, cho nút "Theo dõi bài này". Cần đọc được TÁC GIẢ của bài từ trang: không đọc được thì từ chối,
 * vì hệ thống chỉ theo dõi bài do chính nick của mình đăng.
 */
export function readPostInfo(): PostInfo {
  const parsed = parsePostUrl(location.href);
  if (!parsed) return { ok: false, error: "Trang này không phải link bài đăng (permalink). Mở bài ở trang riêng của nó rồi thử lại." };
  const post = mainPostArticle();
  if (!post) return { ok: false, error: "Không thấy phần bài đăng trên trang. Chờ trang tải xong rồi thử lại." };

  const ownLevel = (el: Element) => el.closest(ARTICLE) === post;
  const candidates = [
    ...post.querySelectorAll<HTMLAnchorElement>('[data-ad-rendering-role="profile_name"] a[href]'),
    ...post.querySelectorAll<HTMLAnchorElement>("h2 a[href], h3 a[href], h4 a[href], strong a[href]"),
  ].filter((a) => ownLevel(a) && textOf(a).trim() !== "" && profileUrlFromAnyLink(a.href) !== null);
  const author = candidates[0];
  if (!author) return { ok: false, error: "Không đọc được tên tác giả của bài (Facebook có thể đã đổi giao diện), nên chưa thể xác nhận đây là bài của nick." };

  const groupLink = [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/groups/"]')].map((a) => canonicalGroupUrl(a.href)).find((u) => u !== null) ?? null;
  const message = post.querySelector<HTMLElement>('[data-ad-comet-preview="message"], [data-ad-preview="message"]');
  return {
    ok: true,
    url: parsed.url,
    authorProfileUrl: profileUrlFromAnyLink(author.href)!,
    authorName: textOf(author).trim() || null,
    groupUrl: parsed.groupUrl ?? groupLink,
    content: (message ? textOf(message) : "").trim().slice(0, 2000),
  };
}
