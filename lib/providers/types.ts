export type TaskStatus = "PROCESSING" | "SUCCESS" | "FAILED";

export type CreateTaskInput = {
  model: string;
  prompt: string;
  /** URL ảnh tham chiếu theo đúng thứ tự: ảnh 1 là logo, các ảnh sau là chất liệu */
  inputUrls: string[];
  aspectRatio: string;
  resolution: string;
  callbackUrl?: string;
};

export type TaskInfo = {
  status: TaskStatus;
  /** URL ảnh kết quả khi SUCCESS */
  resultUrl?: string;
  /** lý do khi FAILED */
  error?: string;
};

/** Nhà cung cấp tạo ảnh AI. Có hai bản cài đặt: MockProvider (ảnh giả) và KieProvider (kie.ai thật). */
export interface ImageProvider {
  readonly name: "mock" | "kie";
  /** true = URL ảnh tham chiếu dùng lại được nhiều lần nên lưu bộ nhớ đệm trong CSDL */
  readonly cacheReferences: boolean;

  /** Đưa ảnh tham chiếu lên kho của nhà cung cấp, trả về URL để gửi kèm lúc tạo tác vụ. */
  uploadReference(input: {
    buffer: Buffer;
    fileName: string;
    contentType: string;
  }): Promise<{ url: string; expiresAt: Date | null }>;

  /** Gửi tác vụ tạo ảnh (bất đồng bộ), trả về taskId ngay. */
  createTask(input: CreateTaskInput): Promise<{ taskId: string }>;

  /** Hỏi trạng thái một tác vụ. */
  getTask(taskId: string): Promise<TaskInfo>;

  /** Tải ảnh kết quả về (link của nhà cung cấp sẽ hết hạn nên phải tải ngay). */
  downloadResult(url: string): Promise<{ buffer: Buffer; contentType: string }>;
}
