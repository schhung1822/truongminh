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

/**
 * File được yêu cầu không có trong kho. Thông báo ghi rõ key để lần ra là file nào (trước đây R2 chỉ trả câu
 * "The specified key does not exist." không kèm tên file).
 */
export class StorageNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`Không tìm thấy file trong kho ảnh: ${key}`);
  }
}

export interface StorageDriver {
  put(key: string, data: Buffer, opts?: PutOptions): Promise<void>;
  /** Ném StorageNotFoundError khi file không có trong kho. */
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  /** Xóa nếu có, không báo lỗi khi không tồn tại. */
  delete(key: string): Promise<void>;
}

/**
 * Bọc một kho ảnh để lệnh xóa không làm gì (STORAGE_NEVER_DELETE="true"). Dùng cho máy dùng chung bucket với máy khác:
 * đọc và ghi như thường, còn file cũ thì để nguyên vì CSDL của máy kia có thể vẫn trỏ tới.
 */
export function withoutDelete(driver: StorageDriver): StorageDriver {
  return {
    put: (key, data, opts) => driver.put(key, data, opts),
    get: (key) => driver.get(key),
    exists: (key) => driver.exists(key),
    delete: async () => {},
  };
}
