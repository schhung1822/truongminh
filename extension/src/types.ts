/** Kiểu dữ liệu dùng chung giữa background, content script, popup và trang cài đặt. */

export type MeResponse = {
  user: string;
  account: { id: string; display_name: string; profile_url: string; status: "ACTIVE" | "PAUSED" | "RESTRICTED" };
  config: { poll_minutes: number; max_posts_per_cycle: number; delay_seconds_between_posts: number };
  server_time: string;
};

export type ScanJob = { post_id: string; url: string; known_comment_ids: string[] };
export type JobsResponse = { scan: ScanJob[]; paused_reason?: string };

export type CommentPayload = {
  fb_comment_id: string;
  parent_fb_comment_id: string | null;
  author_name: string;
  author_profile_url: string | null;
  is_own: boolean;
  text: string;
  time_text: string | null;
};

export type IngestResponse = { new_comments: number; updated_comments: number; new_leads: number; lead_sources: number };

/** Kết quả content script trả về sau khi đọc một bài. */
export type ScanResult =
  | { state: "ok"; comments: CommentPayload[]; complete: boolean; note?: string; resolvedUrl: string }
  | { state: "login" }
  | { state: "checkpoint" }
  | { state: "selector_broken"; item: string; detail?: string; resolvedUrl: string };

export type PostInfo =
  | { ok: true; url: string; authorProfileUrl: string | null; authorName: string | null; groupUrl: string | null; content: string }
  | { ok: false; error: string };

/**
 * Báo cáo chẩn đoán: chỉ gồm số đếm và cấu trúc (thẻ, role, mẫu đường link đã thay số bằng #), KHÔNG có tên người,
 * nội dung comment hay số điện thoại. Dùng để chỉnh bộ đọc khi Facebook đổi giao diện.
 */
export type DiagnosticReport = {
  at: string;
  url: string;
  host: string;
  visibility: string;
  pageState: "ok" | "login" | "checkpoint";
  isPostUrl: boolean;
  counts: {
    articles: number;
    articlesWithCommentLink: number;
    articlesWithCommentLabel: number;
    commentsRead: number;
    commentsWithFallbackId: number;
    ownComments: number;
    /** Chỉ là SỐ ĐẾM: bao nhiêu comment là trả lời, bao nhiêu có dạng số điện thoại hợp lệ. Không có chính các số đó. */
    repliesRead: number;
    commentsWithPhone: number;
  };
  /** Chế độ thử đọc sâu: có bấm mở rộng hết các nút "Xem thêm" không, bao nhiêu lần bấm, có đọc trọn vẹn không. */
  deep: { expanded: boolean; steps: number; complete: boolean; seconds: number } | null;
  buttons: Record<string, string[]>;
  sortButtonLabel: string | null;
  commentCountText: string | null;
  postAuthorFound: boolean;
  mainPostFound: boolean;
  articleLabelPatterns: string[];
  linkPatterns: string[];
  sampleCommentStructure: string[];
  extensionVersion: string;
};

/** Tin nhắn background -> content script. */
export type ContentMessage =
  | { type: "PING" }
  | { type: "SCAN"; ownProfileUrl: string; ownDisplayName: string }
  | { type: "GET_POST_INFO" }
  | { type: "DIAGNOSE"; ownProfileUrl: string; ownDisplayName: string; deep?: boolean };

export type ScanMode = "window" | "tab";

export type Settings = {
  /** Cách mở bài khi quét: "window" = cửa sổ nhỏ riêng (Facebook vẽ đủ nội dung), "tab" = tab nền (yên lặng hơn nhưng Facebook có thể không vẽ hết). */
  scanMode: ScanMode;
  /** Báo trên máy khi có lead mới sau một lần quét. */
  notifyLeads: boolean;
};

export const DEFAULT_SETTINGS: Settings = { scanMode: "window", notifyLeads: true };

/** Tin nhắn popup/options -> background. */
export type BackgroundMessage =
  | { type: "GET_STATUS" }
  | { type: "RUN_NOW" }
  | { type: "FOLLOW_ACTIVE_TAB"; tabId: number }
  | { type: "DIAGNOSE_ACTIVE_TAB"; tabId: number; deep?: boolean }
  | { type: "CONNECT"; token: string }
  | { type: "DISCONNECT" }
  | { type: "GET_SETTINGS" }
  | { type: "SET_SETTINGS"; settings: Partial<Settings> }
  | { type: "GET_EVENTS" }
  | { type: "GET_LAST_DIAGNOSTIC" };

export type CycleSummary = {
  at: string;
  trigger: "alarm" | "manual";
  posts: number;
  newComments: number;
  newLeads: number;
  error: string | null;
};

export type Progress = { total: number; index: number; url: string; startedAt: string } | null;

export type EventLevel = "info" | "ok" | "warn" | "error";
export type EventEntry = { at: string; level: EventLevel; text: string };

export type StatusResponse = {
  connected: boolean;
  user?: string;
  account?: MeResponse["account"];
  running: boolean;
  progress: Progress;
  lastCycle: CycleSummary | null;
  error: string | null;
  appOrigin: string;
  version: string;
  settings: Settings;
  nextRunAt: string | null;
};

export type SimpleResult = { ok: boolean; message: string };
