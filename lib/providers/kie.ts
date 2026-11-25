import sharp from "sharp";
import { kieModel } from "./kie-models";
import { ProviderFatalError, ProviderRateLimitError, type CreateTaskInput, type ImageProvider, type TaskInfo } from "./types";

/**
 * Kết nối kie.ai. Đặc tả lấy từ docs.kie.ai (đã đọc ngày 16/11/2026):
 * - Tạo tác vụ:   POST {API}/api/v1/jobs/createTask   { model, callBackUrl?, input:{prompt,input_urls,aspect_ratio,resolution} }
 *   (đây là hình dạng của dòng GPT Image; các dòng model khác dùng tên trường khác cho ảnh tham chiếu/độ phân giải,
 *   xem lib/providers/kie-models.ts — createTask tra theo model để gửi đúng tên trường)
 * - Hỏi trạng thái: GET  {API}/api/v1/jobs/recordInfo?taskId=...   state: waiting|queuing|generating|success|fail
 * - Upload ảnh:   POST https://kieai.redpandaai.co/api/file-stream-upload (multipart: file, uploadPath, fileName)
 *   -> data.downloadUrl; file bị xóa sau 24 giờ; upload miễn phí.
 * - Mọi phản hồi đều HTTP 200: phải đọc `code` trong nội dung (200 = thành công; 401 sai khóa; 402 hết credits;
 *   429 quá giới hạn tốc độ; 422/500 lỗi xử lý).
 * Khóa API chỉ nằm ở server, chỉ gửi trong header Authorization.
 */

const DEFAULT_UPLOAD_BASE = "https://kieai.redpandaai.co";
const UPLOAD_TTL_MS = 23 * 60 * 60 * 1000; // file bị xóa sau 24h, trừ hao 1h
const MAX_RESULT_BYTES = 60 * 1024 * 1024;
const MAX_PROMPT_CHARS = 20_000;

type Envelope<T> = { code: number; msg?: string; data?: T };

export class KieProvider implements ImageProvider {
  readonly name = "kie" as const;
  readonly cacheReferences = true;

  constructor(
    private readonly apiKey: string,
    private readonly apiBase = "https://api.kie.ai",
    private readonly uploadBase = DEFAULT_UPLOAD_BASE,
  ) {}

  private headers(extra?: Record<string, string>) {
    return { Authorization: `Bearer ${this.apiKey}`, ...extra };
  }

  /** Gọi API và đọc `code` trong nội dung. Lỗi không thể khắc phục bằng cách thử lại thì ném ProviderFatalError. */
  private async call<T>(url: string, init: RequestInit & { timeoutMs?: number }): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 60_000) });
    } catch (e) {
      throw new Error(`Không kết nối được kie.ai: ${e instanceof Error ? e.message : String(e)}`);
    }
    let body: Envelope<T>;
    try {
      body = (await res.json()) as Envelope<T>;
    } catch {
      throw new Error(`kie.ai trả về dữ liệu không đọc được (HTTP ${res.status}).`);
    }
    if (body.code === 200) return body.data as T;
    throw classifyError(body.code, body.msg);
  }

  async uploadReference(input: { buffer: Buffer; fileName: string; contentType: string }) {
    // Tên file duy nhất để tránh bị ghi đè hoặc dính bộ nhớ đệm của lần upload trước
    const dot = input.fileName.lastIndexOf(".");
    const base = dot > 0 ? input.fileName.slice(0, dot) : input.fileName;
    const ext = dot > 0 ? input.fileName.slice(dot) : "";
    const uniqueName = `${base}-${Date.now().toString(36)}${ext}`;

    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(input.buffer)], { type: input.contentType }), uniqueName);
    form.set("uploadPath", "logo-mockup/references");
    form.set("fileName", uniqueName);

    const data = await this.call<{ downloadUrl?: string }>(`${this.uploadBase}/api/file-stream-upload`, {
      method: "POST",
      headers: this.headers(), // KHÔNG tự đặt Content-Type: fetch tự thêm ranh giới multipart
      body: form,
      timeoutMs: 120_000,
    });
    if (!data?.downloadUrl) throw new Error("kie.ai không trả về đường dẫn ảnh tham chiếu sau khi upload.");
    return { url: data.downloadUrl, expiresAt: new Date(Date.now() + UPLOAD_TTL_MS) };
  }

  async createTask(input: CreateTaskInput): Promise<{ taskId: string }> {
    // Mỗi dòng model của kie.ai dùng tên trường khác nhau cho ảnh tham chiếu và độ phân giải, và nhận prompt dài ngắn khác
    // nhau (lib/providers/kie-models.ts). Model lạ (không có trong danh mục) thì giữ hành vi mặc định trước nay.
    const model = kieModel(input.model);
    const maxPrompt = model?.maxPromptChars ?? MAX_PROMPT_CHARS;
    if (input.prompt.length > maxPrompt) {
      throw new ProviderFatalError(
        `Prompt dài ${input.prompt.length} ký tự, vượt giới hạn ${maxPrompt} của ${model?.label ?? "kie.ai"}. Rút gọn prompt ở Quản trị > Prompt hoặc chọn model khác.`,
      );
    }
    if (input.inputUrls.length > 16) {
      throw new ProviderFatalError("kie.ai chỉ nhận tối đa 16 ảnh tham chiếu mỗi lượt.");
    }
    const refField = model?.refField ?? "input_urls";
    const sizeField = model?.sizeField ?? "resolution";
    let sizeValue: string = input.resolution;
    if (model) {
      const size = model.sizes.find((s) => s.resolution === input.resolution);
      if (!size) throw new ProviderFatalError(`${model.label} không hỗ trợ độ phân giải ${input.resolution}.`);
      sizeValue = size.value;
    }
    const data = await this.call<{ taskId?: string }>(`${this.apiBase}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        model: input.model,
        ...(input.callbackUrl ? { callBackUrl: input.callbackUrl } : {}),
        input: {
          prompt: input.prompt,
          [refField]: input.inputUrls,
          aspect_ratio: input.aspectRatio,
          [sizeField]: sizeValue,
        },
      }),
    });
    if (!data?.taskId) throw new Error("kie.ai không trả về taskId.");
    return { taskId: data.taskId };
  }

  async getTask(taskId: string): Promise<TaskInfo> {
    type Record = {
      state?: string;
      resultJson?: string | null;
      failMsg?: string | null;
      failCode?: string | null;
      creditsConsumed?: number | null;
    };
    let rec: Record;
    try {
      rec = await this.call<Record>(`${this.apiBase}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
        method: "GET",
        headers: this.headers(),
      });
    } catch (e) {
      // 422/404: tác vụ không tồn tại hoặc không thuộc tài khoản này -> coi là thất bại
      if (e instanceof ProviderFatalError && /422|404|không tồn tại/i.test(e.message)) {
        return { status: "FAILED", error: e.message };
      }
      throw e;
    }

    const credits = typeof rec.creditsConsumed === "number" ? rec.creditsConsumed : undefined;
    switch (rec.state) {
      case "success": {
        let urls: string[] = [];
        try {
          urls = (JSON.parse(rec.resultJson ?? "{}") as { resultUrls?: string[] }).resultUrls ?? [];
        } catch {
          /* xử lý bên dưới */
        }
        if (urls.length === 0) {
          return { status: "FAILED", error: "kie.ai báo thành công nhưng không có ảnh kết quả.", credits };
        }
        return { status: "SUCCESS", resultUrl: urls[0], credits };
      }
      case "fail":
        return {
          status: "FAILED",
          error: `${rec.failMsg || "kie.ai báo tạo ảnh thất bại."}${rec.failCode ? ` (mã ${rec.failCode})` : ""}`,
          credits,
        };
      default:
        // waiting | queuing | generating
        return { status: "PROCESSING" };
    }
  }

  async downloadResult(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    } catch (e) {
      throw new Error(`Không tải được ảnh kết quả: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) throw new Error(`Tải ảnh kết quả thất bại (HTTP ${res.status}).`);
    let contentType = res.headers.get("content-type")?.split(";")[0].trim() || "";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_RESULT_BYTES) throw new Error("Ảnh kết quả rỗng hoặc quá lớn.");
    if (!contentType.startsWith("image/")) {
      // Kho của kie.ai đôi khi trả application/octet-stream: kiểm tra bằng nội dung thật của file
      const format = await sharp(buffer)
        .metadata()
        .then((m) => m.format)
        .catch(() => undefined);
      if (!format) throw new Error(`Kết quả không phải ảnh (${contentType || "không rõ loại"}).`);
      contentType = `image/${format === "jpeg" ? "jpeg" : format}`;
    }
    return { buffer, contentType };
  }

  /** Số dư credits (không tốn credits). */
  async getCredits(): Promise<number> {
    const data = await this.call<number>(`${this.apiBase}/api/v1/chat/credit`, { method: "GET", headers: this.headers() });
    return Number(data);
  }
}

/** Đổi mã lỗi của kie.ai thành thông báo tiếng Việt, phân loại có nên thử lại hay không. */
export function classifyError(code: number, msg?: string): Error {
  const detail = msg ? ` (${msg})` : "";
  switch (code) {
    case 401:
      return new ProviderFatalError(`Khóa API kie.ai không hợp lệ hoặc đã bị thu hồi${detail}.`);
    case 402:
      return new ProviderFatalError(`Tài khoản kie.ai đã hết credits${detail}. Hãy nạp thêm rồi bấm Tạo lại.`);
    case 429:
      return new ProviderRateLimitError(`kie.ai đang giới hạn tốc độ, sẽ thử lại${detail}.`);
    case 404:
    case 422:
      return new ProviderFatalError(`kie.ai từ chối yêu cầu (mã ${code})${detail}.`);
    default:
      return new Error(`kie.ai báo lỗi (mã ${code})${detail}.`);
  }
}
