/**
 * Lớp lưu trữ ảnh. Code nghiệp vụ CHỈ dùng interface này, không đụng thẳng vào thư mục hay S3.
 * Có hai bản: local.ts (thư mục trên máy chủ) và r2.ts (Cloudflare R2).
 * "key" là đường dẫn tương đối dạng "mockups/abc/2026-11/x8f2k9.webp", luôn dùng dấu "/".
 * CSDL chỉ lưu key; địa chỉ đầy đủ được ghép lúc hiển thị (xem getPublicUrl / fileUrl trong index.ts).
 */
export type PutOptions = {
  /** loại nội dung (ví dụ image/webp); R2 lưu kèm để trình duyệt hiển thị đúng */
  contentType?: string;
};

export interface StorageDriver {
  put(key: string, data: Buffer, opts?: PutOptions): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  /** Xóa nếu có, không báo lỗi khi không tồn tại. */
  delete(key: string): Promise<void>;
}
