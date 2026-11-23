import { APP_ORIGIN } from "./config";
import type { CommentPayload, IngestResponse, JobsResponse, MeResponse } from "./types";

/** Lỗi khi gọi webapp. status = 0 là lỗi mạng. `code` khớp các mã lỗi của /api/ext (TOKEN_REVOKED, INVALID_TOKEN...). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
  /** Mã bị thu hồi, sai, hoặc tài khoản bị khoá: phải nhập lại mã, không thử lại. */
  get isAuthFailure(): boolean {
    return this.code === "TOKEN_REVOKED" || this.code === "INVALID_TOKEN" || this.code === "USER_DISABLED" || this.code === "NO_TOKEN";
  }
}

async function call<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(APP_ORIGIN + path, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      credentials: "omit", // không gửi cookie nào của webapp: xác thực chỉ bằng mã kết nối
    });
  } catch {
    throw new ApiError(0, "NETWORK", `Không kết nối được tới ${APP_ORIGIN}. Kiểm tra mạng hoặc web đang bảo trì.`);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* thân trả về không phải JSON */
  }
  if (!res.ok) {
    const body = (json ?? {}) as { error?: string; code?: string };
    throw new ApiError(res.status, body.code ?? "HTTP_" + res.status, body.error ?? `Webapp trả lỗi ${res.status}.`);
  }
  return json as T;
}

export type IngestBody = {
  scanned_at: string;
  complete: boolean;
  comments: CommentPayload[];
  reported_comment_count?: number | null;
  unchanged?: boolean;
  resolved_url?: string | null;
  note?: string | null;
};

export const api = {
  me: (token: string) => call<MeResponse>(token, "/api/ext/me"),
  jobs: (token: string, force: boolean) => call<JobsResponse>(token, "/api/ext/jobs" + (force ? "?force=1" : "")),
  postComments: (token: string, postId: string, payload: IngestBody) =>
    call<IngestResponse>(token, `/api/ext/posts/${encodeURIComponent(postId)}/comments`, { method: "POST", body: payload }),
  registerPost: (
    token: string,
    body: { url: string; group_url: string | null; content_snapshot: string; author_profile_url: string | null; author_name: string | null },
  ) => call<{ post_id: string; created: boolean }>(token, "/api/ext/posts", { method: "POST", body }),
  log: (token: string, type: "selector_broken" | "checkpoint" | "scan_fail", detail: Record<string, unknown>) =>
    call<{ ok: boolean; account_restricted: boolean }>(token, "/api/ext/logs", { method: "POST", body: { type, detail } }),
};
