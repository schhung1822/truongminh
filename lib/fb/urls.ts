/**
 * Chuẩn hoá link Facebook (nick, nhóm, bài đăng) để so sánh và chống trùng. Hàm thuần.
 * Chỉ nhận địa chỉ facebook.com (kể cả www., m., web., mbasic.), bỏ tham số theo dõi, thống nhất về https://www.facebook.com/...
 */

const HOST_OK = /^(?:www\.|m\.|web\.|mbasic\.|touch\.|l\.)?facebook\.com$/i;

function parse(raw: string): URL | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  try {
    const u = new URL(s);
    return HOST_OK.test(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

const BASE = "https://www.facebook.com";

function segments(u: URL): string[] {
  return u.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
}

const RESERVED_FIRST = new Set([
  "groups", "pages", "watch", "marketplace", "events", "photo", "photo.php", "permalink.php", "share", "story.php", "login",
  "reel", "reels", "stories", "videos", "video.php", "hashtag", "search", "messages", "notifications", "friends", "gaming",
  "help", "settings", "privacy", "policies", "checkpoint", "home.php", "dialog", "ads", "business", "bookmarks", "saved",
]);

/** Trang cá nhân: /<username> hoặc /profile.php?id=<số>. Trả về dạng chuẩn hoặc null. */
export function canonicalProfileUrl(raw: string): string | null {
  const u = parse(raw);
  if (!u) return null;
  const seg = segments(u);
  if (seg[0] === "profile.php") {
    const id = u.searchParams.get("id");
    return id && /^\d{5,}$/.test(id) ? `${BASE}/profile.php?id=${id}` : null;
  }
  if (seg.length === 0) return null;
  if (RESERVED_FIRST.has(seg[0].toLowerCase())) return null;
  if (!/^[A-Za-z0-9.\-_]{3,}$/.test(seg[0])) return null;
  // /<ten>/posts/..., /<ten>/videos/... là link BÀI, không phải link trang cá nhân
  if (seg[1] && ["posts", "videos", "photos", "reels"].includes(seg[1].toLowerCase())) return null;
  return `${BASE}/${seg[0]}`;
}

/** Nhóm: /groups/<id hoặc tên>. */
export function canonicalGroupUrl(raw: string): string | null {
  const u = parse(raw);
  if (!u) return null;
  const seg = segments(u);
  if (seg[0]?.toLowerCase() !== "groups" || !seg[1]) return null;
  const g = seg[1];
  if (!/^[A-Za-z0-9.\-_]{2,}$/.test(g) || ["feed", "discover", "joins", "create"].includes(g.toLowerCase())) return null;
  return `${BASE}/groups/${g}`;
}

export type ParsedPostUrl = {
  /** Địa chỉ chuẩn của bài (dùng làm khoá chống trùng). */
  url: string;
  /** Địa chỉ nhóm chuẩn nếu bài nằm trong nhóm. */
  groupUrl: string | null;
};

const ID = /^[A-Za-z0-9_-]{5,}$/;

/**
 * Bài đăng: các dạng permalink phổ biến.
 *  - /groups/<nhóm>/posts/<id> và /groups/<nhóm>/permalink/<id>
 *  - /<trang cá nhân hoặc trang>/posts/<id>, /<trang>/videos/<id>
 *  - /permalink.php?story_fbid=<id>&id=<id>
 *  - /photo/?fbid=<id> và /photo.php?fbid=<id>  (bài là một ảnh)
 *  - /watch/?v=<id>, /reel/<id>                   (bài là video)
 *  - /share/p/<mã>, /share/v/<mã>, /share/r/<mã>  (link chia sẻ rút gọn; Facebook tự chuyển tới link thật)
 * Link không giống bài đăng (trang chủ, trang cá nhân, nhóm...) thì trả null.
 */
export function parsePostUrl(raw: string): ParsedPostUrl | null {
  const u = parse(raw);
  if (!u) return null;
  const seg = segments(u);
  const lower = seg.map((s) => s.toLowerCase());

  if (lower[0] === "groups" && seg[1] && (lower[2] === "posts" || lower[2] === "permalink") && seg[3]) {
    const groupUrl = canonicalGroupUrl(`${BASE}/groups/${seg[1]}`);
    if (!groupUrl || !ID.test(seg[3])) return null;
    return { url: `${groupUrl}/posts/${seg[3]}`, groupUrl };
  }

  if (lower[0] === "permalink.php") {
    const story = u.searchParams.get("story_fbid");
    const id = u.searchParams.get("id");
    if (!story || !id || !ID.test(story) || !/^\d{5,}$/.test(id)) return null;
    return { url: `${BASE}/permalink.php?story_fbid=${story}&id=${id}`, groupUrl: null };
  }

  if (lower[0] === "photo" || lower[0] === "photo.php") {
    const fbid = u.searchParams.get("fbid");
    if (!fbid || !/^\d{5,}$/.test(fbid)) return null;
    // ảnh đăng trong nhóm có set=gm.<mã nhóm>; không biết nhóm thì để trống
    const set = u.searchParams.get("set") ?? "";
    const gm = /^gm\.(\d{5,})$/.exec(set);
    return { url: `${BASE}/photo/?fbid=${fbid}`, groupUrl: gm ? `${BASE}/groups/${gm[1]}` : null };
  }

  if (lower[0] === "watch") {
    const v = u.searchParams.get("v");
    return v && /^\d{5,}$/.test(v) ? { url: `${BASE}/watch/?v=${v}`, groupUrl: null } : null;
  }

  if ((lower[0] === "reel" || lower[0] === "reels") && seg[1] && /^\d{5,}$/.test(seg[1])) {
    return { url: `${BASE}/reel/${seg[1]}`, groupUrl: null };
  }

  if (lower[0] === "share" && seg[1] && ["p", "v", "r"].includes(lower[1]) && seg[2] && /^[A-Za-z0-9_-]{4,}$/.test(seg[2])) {
    return { url: `${BASE}/share/${lower[1]}/${seg[2]}/`, groupUrl: null };
  }

  if (seg.length >= 3 && (lower[1] === "posts" || lower[1] === "videos") && /^[A-Za-z0-9._-]{3,}$/.test(seg[0]) && ID.test(seg[2]) && !RESERVED_FIRST.has(lower[0])) {
    return { url: `${BASE}/${seg[0]}/${lower[1]}/${seg[2]}`, groupUrl: null };
  }
  return null;
}

/** Link có phải là link tới một bài đăng (kể cả link thời gian của comment có kèm ?comment_id=...). */
export function isPostHref(raw: string): boolean {
  return parsePostUrl(raw) !== null;
}

/** Hai link trang cá nhân có cùng một người không (so sau khi chuẩn hoá, không phân biệt hoa thường). */
export function sameProfile(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = profileUrlFromAnyLink(a);
  const y = profileUrlFromAnyLink(b);
  return !!x && !!y && x.toLowerCase() === y.toLowerCase();
}

/** Tên tạm cho nhóm tự tạo từ link (quản trị sửa lại sau): nhóm đặt tên chữ thì lấy chữ, nhóm số thì "Nhóm <số>". */
export function groupNameFromUrl(groupUrl: string): string {
  const slug = decodeURIComponent(groupUrl.split("/groups/")[1] ?? "").split("/")[0];
  if (!slug) return "Nhóm Facebook";
  return /^\d+$/.test(slug) ? `Nhóm ${slug}` : slug.replace(/[-_.]+/g, " ").trim().slice(0, 100) || "Nhóm Facebook";
}

/**
 * Link người viết như hiện trên trang Facebook -> link trang cá nhân chuẩn. Ngoài dạng thường (/ten.ban, /profile.php?id=...),
 * trong nhóm Facebook dùng /groups/<nhóm>/user/<số>/ : đổi thành /profile.php?id=<số> để so sánh và chống trùng.
 */
export function profileUrlFromAnyLink(raw: string): string | null {
  const direct = canonicalProfileUrl(raw);
  if (direct) return direct;
  const u = parse(raw);
  if (!u) return null;
  const seg = segments(u);
  if (seg[0]?.toLowerCase() === "groups" && seg[2]?.toLowerCase() === "user" && /^\d{5,}$/.test(seg[3] ?? "")) {
    return `${BASE}/profile.php?id=${seg[3]}`;
  }
  return null;
}
