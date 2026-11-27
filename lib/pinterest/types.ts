/** Mặc định chỉ xin quyền đọc tối thiểu; quyền board bí mật bật riêng trong .env khi App Pinterest đã được cấp. */
export const PINTEREST_PUBLIC_SCOPES = ["boards:read", "pins:read", "user_accounts:read"] as const;
export const PINTEREST_SECRET_SCOPES = ["boards:read_secret", "pins:read_secret"] as const;

export type PinterestTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  /** số giây còn hạn của access_token (thường 2592000 = 30 ngày) */
  expires_in: number;
  /** số giây còn hạn của refresh_token (thường 5184000 = 60 ngày, dùng "continuous refresh") */
  refresh_token_expires_in: number;
  scope: string;
};

export type PinterestAccountInfo = {
  id: string;
  username: string;
  profile_image?: string | null;
};

type PinterestImageSize = { width: number; height: number; url: string };

export type PinterestBoardApi = {
  id: string;
  name: string;
  description?: string | null;
  privacy?: "PUBLIC" | "PROTECTED" | "SECRET";
  pin_count?: number | null;
  /** lần cuối pin trong board thay đổi (thêm/bớt); cùng với pin_count làm "dấu" để biết board có gì mới (lib/pinterest/feed.ts) */
  board_pins_modified_at?: string | null;
  media?: { image_cover_url?: string | null };
};

export type PinterestPinApi = {
  id: string;
  /** lúc pin được tạo; pin lưu lại từ pin của người khác là một pin MỚI nên đây là lúc lưu */
  created_at?: string | null;
  title?: string | null;
  description?: string | null;
  alt_text?: string | null;
  media?: {
    media_type?: string;
    images?: Record<string, PinterestImageSize>;
  };
};

export type PinterestPage<T> = { items: T[]; bookmark: string | null };
