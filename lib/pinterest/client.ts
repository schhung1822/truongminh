import "server-only";
import type { PinterestAccountInfo, PinterestBoardApi, PinterestPage, PinterestPinApi, PinterestTokenResponse } from "./types";
import { PINTEREST_PUBLIC_SCOPES } from "./types";

/**
 * Gọi thẳng Pinterest API v5 (đã đọc kỹ tài liệu chính thức + openapi.yaml ngày viết code này, xem docs/DECISIONS.md).
 * Chỉ có các việc cần: OAuth (đổi mã, làm mới token), lấy thông tin tài khoản, liệt kê board và pin trong board.
 */

const AUTHORIZE_BASE = "https://www.pinterest.com/oauth/";
const API_BASE = "https://api.pinterest.com/v5";

export class PinterestApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** true = Pinterest báo access_token hết hạn/không hợp lệ (cần làm mới bằng refresh_token). */
export function isPinterestAuthError(e: unknown): boolean {
  return e instanceof PinterestApiError && e.status === 401;
}

export function buildAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string; scopes?: readonly string[] }): string {
  const sp = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: (input.scopes ?? PINTEREST_PUBLIC_SCOPES).join(","),
    state: input.state,
  });
  return `${AUTHORIZE_BASE}?${sp.toString()}`;
}

function basicAuth(clientId: string, clientSecret: string): string {
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

async function tokenRequest(clientId: string, clientSecret: string, body: Record<string, string>): Promise<PinterestTokenResponse> {
  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(clientId, clientSecret), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new PinterestApiError(`Pinterest từ chối yêu cầu lấy token (mã ${res.status}): ${text.slice(0, 300)}`, res.status);
  return JSON.parse(text) as PinterestTokenResponse;
}

/** Đổi authorization code (từ callback OAuth) lấy access_token + refresh_token lần đầu. */
export function exchangeCode(input: { clientId: string; clientSecret: string; code: string; redirectUri: string }): Promise<PinterestTokenResponse> {
  return tokenRequest(input.clientId, input.clientSecret, { grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri });
}

/** Làm mới access_token bằng refresh_token; Pinterest trả refresh_token MỚI, phải lưu lại (continuous refresh, hạn 60 ngày). */
export function refreshAccessToken(input: { clientId: string; clientSecret: string; refreshToken: string }): Promise<PinterestTokenResponse> {
  return tokenRequest(input.clientId, input.clientSecret, { grant_type: "refresh_token", refresh_token: input.refreshToken });
}

async function apiGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const text = await res.text();
  if (!res.ok) throw new PinterestApiError(`Pinterest API lỗi (mã ${res.status}) ở ${path}: ${text.slice(0, 300)}`, res.status);
  return JSON.parse(text) as T;
}

export function getAccount(accessToken: string): Promise<PinterestAccountInfo> {
  return apiGet(accessToken, "/user_account");
}

/** Liệt kê board của tài khoản (cả board riêng tư nếu token có boards:read_secret). page_size tối đa 250. */
export function listBoards(accessToken: string, bookmark?: string): Promise<PinterestPage<PinterestBoardApi>> {
  const sp = new URLSearchParams({ page_size: "250" });
  if (bookmark) sp.set("bookmark", bookmark);
  return apiGet(accessToken, `/boards?${sp.toString()}`);
}

/** Liệt kê pin trong một board. page_size tối đa 250. */
export function listBoardPins(accessToken: string, boardId: string, bookmark?: string): Promise<PinterestPage<PinterestPinApi>> {
  const sp = new URLSearchParams({ page_size: "250" });
  if (bookmark) sp.set("bookmark", bookmark);
  return apiGet(accessToken, `/boards/${encodeURIComponent(boardId)}/pins?${sp.toString()}`);
}
