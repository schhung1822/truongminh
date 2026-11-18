import "server-only";
import { getEnv } from "@/lib/env";
import { PLAN_MARKER } from "@/lib/zalo/care-plan";

/**
 * Chat AI qua kie.ai (kiểu OpenAI: POST {KIE_API_BASE}/{model}/v1/chat/completions, "Authorization: Bearer <key>").
 * Dùng cho bot Zalo trả lời khách và nút "AI soạn". Mọi lượt gọi trừ credit của tài khoản kie.ai.
 * Khi IMAGE_PROVIDER="mock" thì dùng bản giả, không gọi mạng, không tốn tiền.
 */

export type ChatPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMessage = { role: "system" | "user" | "assistant"; content: ChatPart[] };
export type ChatResult = { text: string; promptTokens: number; completionTokens: number };

export class ChatError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

export interface ChatProvider {
  complete(input: { model: string; messages: ChatMessage[]; signal?: AbortSignal }): Promise<ChatResult>;
}

export const text = (t: string): ChatPart => ({ type: "text", text: t });

/** Các địa chỉ có thể dùng cho một model (kie.ai có hai kiểu đường dẫn, thử lần lượt nếu gặp 404). */
export function buildChatUrls(apiBase: string, model: string): string[] {
  const base = apiBase.replace(/\/$/, "");
  const m = encodeURIComponent(model);
  return [`${base}/${m}/v1/chat/completions`, `${base}/api/v1/${m}/v1/chat/completions`];
}

function explain(code: number, msg?: string): ChatError {
  const detail = msg ? ` (${msg})` : "";
  switch (code) {
    case 401:
      return new ChatError(`Khóa kie.ai không hợp lệ${detail}.`, code);
    case 402:
      return new ChatError(`Tài khoản kie.ai hết token${detail}. Nạp thêm để bot trả lời.`, code);
    case 404:
      return new ChatError(`kie.ai không có model chat này${detail}. Kiểm tra tên model ở Quản trị > Zalo.`, code);
    case 422:
    case 400:
      return new ChatError(`kie.ai từ chối yêu cầu${detail}.`, code);
    case 429:
      return new ChatError(`kie.ai đang giới hạn tốc độ${detail}. Thử lại sau ít phút.`, code, true);
    default:
      return new ChatError(`kie.ai báo lỗi (mã ${code})${detail}.`, code, code >= 500);
  }
}

type RawResponse = {
  code?: number;
  msg?: string;
  error?: { message?: string; code?: number } | string;
  choices?: { message?: { content?: unknown } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === "object" && "text" in p && typeof p.text === "string" ? p.text : ""))
      .join("");
  }
  return "";
}

/** Đọc phản hồi của kie.ai; lỗi có thể nằm ngay trong thân dù HTTP 200 (mã trong "code"). */
export function parseChatResponse(status: number, body: RawResponse): ChatResult {
  const choice = body.choices?.[0]?.message?.content;
  if (choice !== undefined) {
    const out = contentToText(choice).trim();
    if (!out) throw new ChatError("AI không trả về nội dung.", 200, true);
    return {
      text: out,
      promptTokens: body.usage?.prompt_tokens ?? 0,
      completionTokens: body.usage?.completion_tokens ?? 0,
    };
  }
  const errMsg = typeof body.error === "string" ? body.error : (body.error?.message ?? body.msg);
  const code = (typeof body.code === "number" && body.code !== 200 ? body.code : undefined) ?? (typeof body.error === "object" ? body.error?.code : undefined) ?? status;
  throw explain(code && code !== 200 ? code : 500, errMsg);
}

export class KieChat implements ChatProvider {
  constructor(
    private readonly apiKey: string,
    private readonly apiBase: string,
  ) {}

  async complete(input: { model: string; messages: ChatMessage[]; signal?: AbortSignal }): Promise<ChatResult> {
    const urls = buildChatUrls(this.apiBase, input.model);
    let lastError: ChatError | undefined;
    for (const url of urls) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          // stream=false để nhận cả câu trả lời một lần
          body: JSON.stringify({ messages: input.messages, stream: false }),
          signal: input.signal ?? AbortSignal.timeout(60_000),
        });
      } catch (e) {
        throw new ChatError(`Không kết nối được kie.ai: ${e instanceof Error ? e.name : "lỗi mạng"}.`, 0, true);
      }
      let body: RawResponse = {};
      try {
        body = (await res.json()) as RawResponse;
      } catch {
        if (res.status === 404) {
          lastError = explain(404);
          continue;
        }
        throw explain(res.status || 500);
      }
      try {
        return parseChatResponse(res.status, body);
      } catch (e) {
        if (e instanceof ChatError && e.code === 404 && url !== urls[urls.length - 1]) {
          lastError = e;
          continue; // thử kiểu đường dẫn còn lại
        }
        throw e;
      }
    }
    throw lastError ?? explain(404);
  }
}

/** Bản giả cho dev/test: trả lời cố định, không gọi mạng. Có từ "nhân viên" thì kèm dấu hiệu chuyển người. */
export class MockChat implements ChatProvider {
  async complete(input: { messages: ChatMessage[] }): Promise<ChatResult> {
    // Lên kịch bản chăm sóc: trả JSON giả theo các ngày ghi trong yêu cầu
    const sys = input.messages.find((m) => m.role === "system")?.content.map((p) => (p.type === "text" ? p.text : "")).join(" ") ?? "";
    if (sys.includes(PLAN_MARKER)) {
      const usr = input.messages.find((m) => m.role === "user")?.content.map((p) => (p.type === "text" ? p.text : "")).join(" ") ?? "";
      const days = /NGÀY CẦN LÊN KỊCH BẢN: ([^\n]+)/.exec(usr)?.[1].split(",").map((d) => d.trim()) ?? [];
      const code = /\b(I1) \(ảnh\)/.exec(usr)?.[1] ?? null;
      const posts = days.flatMap((date, i) => [
        { date, time: "08:00", kind: "TEXT", text: `(Mock) Chào buổi sáng cả nhà! Ngày ${date}, trời lạnh nhớ giữ ấm nhé.`, media: null, reason: "Trời lạnh, chào buổi sáng" },
        { date, time: "19:30", kind: code ? "IMAGE" : "TEXT", text: `(Mock) Mẫu mới tối nay (${i + 1}): logo trên mica trong suốt rất đẹp. Nhắn xưởng để được tư vấn.`, media: code, reason: "Giờ vàng buổi tối" },
      ]);
      return { text: JSON.stringify({ posts }), promptTokens: 20, completionTokens: 40 };
    }
    const last = [...input.messages].reverse().find((m) => m.role === "user");
    const said = last?.content.map((p) => (p.type === "text" ? p.text : "[ảnh]")).join(" ") ?? "";
    const wantsHuman = /nhân viên|nhan vien|\[\[nhan_vien\]\]/i.test(said);
    return {
      text: wantsHuman ? "(Mock) Để em chuyển nhân viên hỗ trợ. [[NHAN_VIEN]]" : `(Mock) Em đã nhận: ${said.slice(0, 120)}`,
      promptTokens: 10,
      completionTokens: 5,
    };
  }
}

let instance: ChatProvider | undefined;

export function getChatProvider(): ChatProvider {
  if (instance) return instance;
  const env = getEnv();
  instance = env.IMAGE_PROVIDER === "kie" ? new KieChat(env.KIE_API_KEY!, env.KIE_API_BASE) : new MockChat();
  return instance;
}
