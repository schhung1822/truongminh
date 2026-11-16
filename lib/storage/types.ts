/**
 * Lớp lưu trữ ảnh. Code nghiệp vụ CHỈ dùng interface này, không đụng thẳng vào thư mục.
 * Sau này thêm bản S3/R2 (s3.ts) mà không phải sửa chỗ khác.
 * "key" là đường dẫn tương đối dạng "materials/abc/layer1-123.jpg", luôn dùng dấu "/".
 */
export interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  /** Xóa nếu có, không báo lỗi khi không tồn tại. */
  delete(key: string): Promise<void>;
}
