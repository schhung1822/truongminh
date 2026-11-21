/** Kiểu dữ liệu dùng chung giữa background, content script và popup. */

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
  | { state: "ok"; comments: CommentPayload[]; complete: boolean; note?: string }
  | { state: "login" }
  | { state: "checkpoint" }
  | { state: "selector_broken"; item: string; detail?: string };

export type PostInfo =
  | { ok: true; url: string; authorProfileUrl: string; authorName: string | null; groupUrl: string | null; content: string }
  | { ok: false; error: string };

/** Tin nhắn background -> content script. */
export type ContentMessage = { type: "SCAN"; ownProfileUrl: string; ownDisplayName: string } | { type: "GET_POST_INFO" };

/** Tin nhắn popup/options -> background. */
export type BackgroundMessage =
  | { type: "GET_STATUS" }
  | { type: "RUN_NOW" }
  | { type: "FOLLOW_ACTIVE_TAB"; tabId: number }
  | { type: "CONNECT"; token: string }
  | { type: "DISCONNECT" };

export type CycleSummary = {
  at: string;
  trigger: "alarm" | "manual";
  posts: number;
  newComments: number;
  newLeads: number;
  error: string | null;
};

export type StatusResponse = {
  connected: boolean;
  user?: string;
  account?: MeResponse["account"];
  running: boolean;
  lastCycle: CycleSummary | null;
  error: string | null;
  appOrigin: string;
};
