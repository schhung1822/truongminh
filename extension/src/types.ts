/** Kiểu dữ liệu dùng chung giữa background, content script, popup và trang cài đặt. */

export type MeResponse = {
  user: string;
  account: { id: string; display_name: string; profile_url: string; status: "ACTIVE" | "PAUSED" | "RESTRICTED" };
  config: { poll_minutes: number; max_posts_per_cycle: number; delay_seconds_between_posts: number };
  /** Số câu trả lời đã duyệt đang chờ điền, tách theo người đứng tên. Webapp bản cũ không gửi trường này. */
  replies?: { account: number; page: number };
  /** Tên các fanpage đang bật trên webapp (để che tên trong báo cáo chẩn đoán và nhận ra danh tính đang chọn). */
  pages?: string[];
  server_time: string;
};

export type ScanJob = { post_id: string; url: string; known_comment_ids: string[]; reported_comment_count: number | null; force_full_scan: boolean };

/** Một câu trả lời ĐÃ ĐƯỢC NGƯỜI DUYỆT trên webapp. Extension điền vào ô trả lời của comment rồi dừng; người tự bấm gửi. */
export type ReplyJob = {
  reply_id: string;
  post_id: string;
  post_url: string;
  fb_comment_id: string;
  parent_fb_comment_id: string | null;
  author_name: string;
  text: string;
  reply_as: "account" | "page";
  page_name: string | null;
  intent: "answer_interest" | "supplier_offer";
};
export type JobsResponse = { scan: ScanJob[]; replies?: ReplyJob[]; paused_reason?: string };

/** Lý do không điền được, gửi về webapp trong fail_reason (nhãn hiển thị ở lib/fb/reply-labels.ts). */
export type ReplyFailReason =
  | "page_not_available"
  | "identity_unverified"
  | "comment_not_found"
  | "reply_button_not_found"
  | "reply_box_not_found"
  | "fill_failed"
  | "tab_closed"
  | "page_load_timeout"
  | "content_unreachable";

/** Kết quả content script trả về sau khi thử điền một câu. */
export type FillResult =
  | { state: "filled" }
  | { state: "already_replied" }
  | { state: "login" }
  | { state: "checkpoint" }
  | { state: "failed"; reason: ReplyFailReason; item?: string; detail?: string };

/**
 * Kết quả một lượt chờ người bấm gửi: `sent` = câu trả lời đã xuất hiện; `skipped` / `stopped` = người bấm nút trên bảng nhỏ của
 * extension; `waiting` = hết lượt chờ ngắn, background hỏi tiếp; `lost` = trang đã tải lại nên không còn theo dõi được.
 */
export type WaitResult = { state: "sent" } | { state: "skipped" } | { state: "stopped" } | { state: "waiting" } | { state: "lost" };

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
  | { state: "ok"; comments: CommentPayload[]; complete: boolean; reportedCount: number | null; note?: string; resolvedUrl: string }
  | { state: "login" }
  | { state: "checkpoint" }
  | { state: "selector_broken"; item: string; detail?: string; resolvedUrl: string };

export type CommentCountResult =
  | { state: "ok"; count: number | null; resolvedUrl: string }
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
  /**
   * Cấu trúc của luồng trả lời (v1.1), để chỉnh REPLY_LABELS trong selectors.ts: số nút "Phản hồi", số ô nhập, nhãn ô nhập và các
   * nút ứng viên của bộ chọn danh tính. Nhãn đã che tên: tên nick thành {nick}, tên fanpage thành {page}, tên khác thành {…}.
   */
  reply?: { replyActions: number; textboxes: number; textboxLabels: string[]; identityByLabel: string[]; identityByStructure: string[] };
  /** Chế độ thử đọc sâu: có bấm mở rộng hết các nút "Xem thêm" không, bao nhiêu lần bấm, có đọc trọn vẹn không. */
  deep: { expanded: boolean; steps: number; complete: boolean; seconds: number; stableRounds?: number; reportedCount?: number | null } | null;
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
  | { type: "GET_COMMENT_COUNT" }
  | { type: "GET_POST_INFO" }
  | { type: "DIAGNOSE"; ownProfileUrl: string; ownDisplayName: string; deep?: boolean; pageNames?: string[] }
  | {
      /** Tìm comment, mở ô trả lời, chọn đúng danh tính, điền câu rồi DỪNG. Không bao giờ gửi. */
      type: "REPLY_FILL";
      fbCommentId: string;
      parentFbCommentId: string | null;
      text: string;
      replyAs: "account" | "page";
      pageName: string | null;
      ownProfileUrl: string;
      ownDisplayName: string;
      /** Tên mọi fanpage đang bật: để nhận ra khi ô trả lời đang ở danh tính fanpage lúc cần trả lời bằng nick. */
      pageNames: string[];
    }
  | { type: "REPLY_WAIT"; sliceMs: number }
  | { type: "REPLY_PANEL"; text: string; tone: "info" | "ok" | "warn"; buttons: boolean }
  | { type: "REPLY_CANCEL"; clearBox: boolean };

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
  | { type: "GET_LAST_DIAGNOSTIC" }
  /** Người dùng bấm "Xử lý trả lời" trên popup cho một nhóm: câu đứng tên nick, hoặc câu đứng tên fanpage. */
  | { type: "START_REPLIES"; group: "account" | "page" }
  | { type: "STOP_REPLIES" };

export type CycleSummary = {
  at: string;
  trigger: "alarm" | "manual";
  posts: number;
  newComments: number;
  newLeads: number;
  error: string | null;
};

export type Progress = { total: number; index: number; url: string; startedAt: string } | null;

/** Tiến độ của một lượt "Xử lý trả lời" đang chạy (chỉ giữ trong bộ nhớ của service worker). */
export type ReplyProgress = { group: "account" | "page"; total: number; index: number; phase: "opening" | "filling" | "waiting"; url: string } | null;

export type EventLevel = "info" | "ok" | "warn" | "error";
export type EventEntry = { at: string; level: EventLevel; text: string };

export type StatusResponse = {
  connected: boolean;
  user?: string;
  account?: MeResponse["account"];
  running: boolean;
  progress: Progress;
  replyProgress: ReplyProgress;
  /** Số câu đã duyệt đang chờ điền (chỉ có khi đã kết nối). */
  replies: { account: number; page: number } | null;
  lastCycle: CycleSummary | null;
  error: string | null;
  appOrigin: string;
  version: string;
  settings: Settings;
  nextRunAt: string | null;
};

export type SimpleResult = { ok: boolean; message: string };
