import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ IMAGE_PROVIDER: "mock", KIE_API_BASE: "https://api.kie.ai" }) }));

import { buildChatUrls, ChatError, KieChat, MockChat, parseChatResponse, text } from "./chat";

describe("buildChatUrls", () => {
  it("có hai kiểu đường dẫn, model được mã hóa", () => {
    expect(buildChatUrls("https://api.kie.ai/", "gemini-2.5-flash")).toEqual([
      "https://api.kie.ai/gemini-2.5-flash/v1/chat/completions",
      "https://api.kie.ai/api/v1/gemini-2.5-flash/v1/chat/completions",
    ]);
  });
});

describe("parseChatResponse", () => {
  it("đọc nội dung và token", () => {
    const r = parseChatResponse(200, { choices: [{ message: { content: " Xin chào " } }], usage: { prompt_tokens: 12, completion_tokens: 3 } });
    expect(r).toEqual({ text: "Xin chào", promptTokens: 12, completionTokens: 3 });
  });

  it("nội dung dạng mảng các đoạn chữ", () => {
    const r = parseChatResponse(200, { choices: [{ message: { content: [{ type: "text", text: "A" }, { type: "text", text: "B" }] } }] });
    expect(r.text).toBe("AB");
  });

  it("lỗi nằm trong thân dù HTTP 200: dịch sang tiếng Việt", () => {
    expect(() => parseChatResponse(200, { code: 402, msg: "Credits insufficient" })).toThrow(/hết token/);
    expect(() => parseChatResponse(200, { code: 401, msg: "bad key" })).toThrow(/Khóa kie\.ai/);
  });

  it("429 cho phép thử lại, 401 thì không", () => {
    try {
      parseChatResponse(200, { code: 429 });
    } catch (e) {
      expect((e as ChatError).retryable).toBe(true);
    }
    try {
      parseChatResponse(200, { code: 401 });
    } catch (e) {
      expect((e as ChatError).retryable).toBe(false);
    }
  });

  it("nội dung rỗng là lỗi có thể thử lại", () => {
    expect(() => parseChatResponse(200, { choices: [{ message: { content: "  " } }] })).toThrow(/không trả về nội dung/);
  });
});

describe("KieChat", () => {
  const msgs = [{ role: "user" as const, content: [text("hi")] }];

  it("gặp 404 ở đường dẫn đầu thì thử đường dẫn thứ hai", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return url.includes("/api/v1/")
          ? new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 })
          : new Response("not found", { status: 404 });
      }),
    );
    const r = await new KieChat("k", "https://api.kie.ai").complete({ model: "m", messages: msgs });
    expect(r.text).toBe("ok");
    expect(calls).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it("gửi khóa trong header và stream=false", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await new KieChat("secret-key", "https://api.kie.ai").complete({ model: "m", messages: msgs });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-key");
    expect(JSON.parse(init.body as string).stream).toBe(false);
    vi.unstubAllGlobals();
  });

  it("lỗi mạng không lộ địa chỉ hay khóa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed https://api.kie.ai secret"))));
    await expect(new KieChat("secret", "https://api.kie.ai").complete({ model: "m", messages: msgs })).rejects.toThrow(/lỗi mạng|TypeError/);
    vi.unstubAllGlobals();
  });
});

describe("MockChat", () => {
  it("trả lời cố định, và đánh dấu chuyển nhân viên khi khách đòi", async () => {
    const a = await new MockChat().complete({ messages: [{ role: "user", content: [text("giá bao nhiêu")] }] });
    expect(a.text).toContain("Em đã nhận");
    const b = await new MockChat().complete({ messages: [{ role: "user", content: [text("cho gặp nhân viên")] }] });
    expect(b.text).toContain("[[NHAN_VIEN]]");
  });
});
