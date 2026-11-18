import sharp from "sharp";

/**
 * Kết nối Zalo Bot. Đặc tả lấy từ bot.zaloplatforms.com/docs (đã đọc ngày 18/11/2026):
 * - Mọi lệnh:  POST {API}/bot{BOT_TOKEN}/{tên lệnh}   (token nằm ngay sau chữ "bot" trong đường dẫn, không có dấu "/")
 * - sendPhoto: multipart/form-data gồm chat_id, photo (file JPEG/PNG/WebP, tối đa 10MB), caption (1-2000 ký tự, tùy chọn)
 * - sendMessage: JSON { chat_id, text (1-2000 ký tự) }
 * - setWebhook:  JSON { url (https công khai), secret_token (8-256 ký tự) }
 * - getMe:       không tham số, trả về { ok, result: { id, account_name, account_type, can_join_groups } }
 * - Thành công: { ok: true, result }. Lỗi: mã HTTP/error_code theo bảng lỗi (400, 401, 410, 422, 423, 424, 429, 503...).
 * Mỗi lần gửi tin/ảnh tính vào hạn mức tin nhắn THÁNG của bot; hết thì trả 429.
 * Token chỉ nằm ở server, chỉ nằm trong đường dẫn gọi API.
 */

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_CAPTION_CHARS = 2000;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
const SAFE_PHOTO_BYTES = 9 * 1024 * 1024; // chừa chỗ cho phần đầu multipart

export class ZaloError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    /** có nên thử lại không (mạng, hệ thống bảo trì...) */
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** Đổi mã lỗi của Zalo thành thông báo tiếng Việt, kèm việc có nên thử lại hay không. */
export function classifyZaloError(code: number, description?: string): ZaloError {
  const detail = description ? ` (${description})` : "";
  switch (code) {
    case 400:
      return new ZaloError(`Zalo từ chối yêu cầu: thiếu hoặc sai tham số${detail}.`, code, false);
    case 401:
      return new ZaloError(`Token bot Zalo không hợp lệ hoặc đã hết hạn${detail}.`, code, false);
    case 410:
      return new ZaloError(`Mã nhóm Zalo (chat_id) không hợp lệ${detail}. Kiểm tra lại mã nhóm.`, code, false);
    case 422:
      return new ZaloError(
        `Bot không được phép gửi vào nhóm này${detail}. Kiểm tra bot còn trong nhóm và đã được trưởng nhóm kích hoạt.`,
        code,
        false,
      );
    case 423:
      return new ZaloError(`Nội dung tin chứa từ bị Zalo chặn${detail}.`, code, false);
    case 431:
      return new ZaloError(`Địa chỉ file không hợp lệ${detail}.`, code, false);
    case 432:
      return new ZaloError(`Zalo không nhận loại file này${detail}.`, code, false);
    case 433:
      return new ZaloError(`File quá lớn so với giới hạn của Zalo${detail}.`, code, false);
    case 424:
      return new ZaloError(`Zalo báo ảnh không hợp lệ${detail}.`, code, false);
    case 429:
      return new ZaloError(`Bot Zalo đã hết hạn mức tin nhắn trong tháng${detail}.`, code, false);
    case 503:
      return new ZaloError(`Zalo đang bảo trì${detail}.`, code, true);
    default:
      // 403 (Zalo ghi là lỗi hệ thống), 5xx và mã lạ: thử lại một lần
      return new ZaloError(`Zalo báo lỗi (mã ${code})${detail}.`, code, code === 403 || code >= 500);
  }
}

type Envelope<T> = { ok?: boolean; result?: T; error_code?: number; description?: string };

export class ZaloClient {
  constructor(
    private readonly token: string,
    private readonly apiBase = "https://bot-api.zaloplatforms.com",
  ) {}

  private async call<T>(method: string, init: { json?: unknown; form?: FormData; timeoutMs?: number }): Promise<T> {
    const url = `${this.apiBase.replace(/\/$/, "")}/bot${this.token}/${method}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        ...(init.form
          ? { body: init.form } // KHÔNG tự đặt Content-Type: fetch tự thêm ranh giới multipart
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.json ?? {}) }),
        signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
      });
    } catch (e) {
      // Không in URL (có token) vào thông báo lỗi
      throw new ZaloError(`Không kết nối được Zalo: ${e instanceof Error ? e.name : "lỗi mạng"}.`, 0, true);
    }
    let body: Envelope<T> = {};
    try {
      body = (await res.json()) as Envelope<T>;
    } catch {
      if (!res.ok) throw classifyZaloError(res.status);
      throw new ZaloError(`Zalo trả về dữ liệu không đọc được (HTTP ${res.status}).`, res.status, true);
    }
    if (res.ok && body.ok !== false) return body.result as T;
    throw classifyZaloError(body.error_code ?? res.status, body.description);
  }

  /** Kiểm tra token và xem thông tin bot. Không tốn hạn mức. */
  getMe() {
    return this.call<{ id?: string; account_name?: string; account_type?: string; can_join_groups?: boolean }>("getMe", {});
  }

  /** Gửi tin chữ. */
  sendMessage(chatId: string, text: string) {
    return this.call<{ message_id?: string }>("sendMessage", {
      json: { chat_id: chatId, text: text.slice(0, MAX_CAPTION_CHARS) },
    });
  }

  /** Gửi ảnh bằng cách upload thẳng file (không cần link công khai). Ảnh quá 9MB được nén bớt. */
  async sendPhoto(input: { chatId: string; image: Buffer; fileName: string; caption?: string }) {
    let image = input.image;
    let fileName = input.fileName;
    if (image.length > SAFE_PHOTO_BYTES) {
      image = await sharp(image).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      fileName = fileName.replace(/\.[^.]+$/, "") + ".jpg";
      if (image.length > SAFE_PHOTO_BYTES) throw new ZaloError("Ảnh quá lớn (trên 10MB) để gửi qua Zalo.", 0, false);
    }
    const form = new FormData();
    form.set("chat_id", input.chatId);
    if (input.caption) form.set("caption", input.caption.slice(0, MAX_CAPTION_CHARS));
    form.set("photo", new Blob([new Uint8Array(image)], { type: mimeOf(fileName) }), fileName);
    return this.call<{ message_id?: string }>("sendPhoto", { form, timeoutMs: 60_000 });
  }

  /** Hiện trạng thái "đang soạn tin" trong chat riêng. Lỗi thì bỏ qua (chỉ là hiệu ứng). */
  async sendTyping(chatId: string): Promise<void> {
    try {
      await this.call("sendChatAction", { json: { chat_id: chatId, action: "typing" }, timeoutMs: 8_000 });
    } catch {
      /* không quan trọng */
    }
  }

  /** Gửi file tài liệu (PDF, ZIP, Word, Excel...) bằng cách upload thẳng, tối đa 50MB. */
  sendFile(input: { chatId: string; data: Buffer; fileName: string; caption?: string }) {
    if (input.data.length > MAX_FILE_BYTES) throw new ZaloError("File quá lớn (trên 50MB) để gửi qua Zalo.", 433, false);
    const form = new FormData();
    form.set("chat_id", input.chatId);
    form.set("file_name", input.fileName.slice(0, 255));
    if (input.caption) form.set("caption", input.caption.slice(0, MAX_CAPTION_CHARS));
    form.set("file", new Blob([new Uint8Array(input.data)]), input.fileName);
    return this.call<{ message_id?: string }>("sendFile", { form, timeoutMs: 120_000 });
  }

  /** Đăng ký địa chỉ nhận webhook. Địa chỉ phải là https công khai (localhost bị từ chối). */
  setWebhook(url: string, secretToken: string) {
    return this.call<{ url?: string; verification?: { ok?: boolean; outcome?: string; hint?: string } }>("setWebhook", {
      json: { url, secret_token: secretToken },
    });
  }
}

function mimeOf(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}
