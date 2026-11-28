import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCaption, publicSessionUrl } from "./caption";
import { ZaloClient, ZaloError, classifyZaloError } from "./client";

const client = () => new ZaloClient("TOKEN123", "https://api.example");

function mockFetch(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("ZaloClient.sendPhoto", () => {
  it("gọi đúng địa chỉ (token ngay sau chữ bot) và gửi multipart gồm chat_id, caption, photo", async () => {
    const calls = mockFetch(200, { ok: true, result: { message_id: "m1", date: 1 } });
    const image = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    const r = await client().sendPhoto({ chatId: "grp1", image, fileName: "a.jpg", caption: "Xin chào" });
    expect(r.message_id).toBe("m1");
    expect(calls[0].url).toBe("https://api.example/botTOKEN123/sendPhoto");
    expect(calls[0].init!.method).toBe("POST");
    const form = calls[0].init!.body as FormData;
    expect(form.get("chat_id")).toBe("grp1");
    expect(form.get("caption")).toBe("Xin chào");
    const photo = form.get("photo") as File;
    expect(photo.name).toBe("a.jpg");
    expect(photo.type).toBe("image/jpeg");
    // không tự đặt Content-Type để fetch thêm ranh giới multipart
    expect(calls[0].init!.headers).toBeUndefined();
  });

  it("không gửi trường caption khi không có caption", async () => {
    const calls = mockFetch(200, { ok: true, result: {} });
    await client().sendPhoto({ chatId: "g", image: Buffer.from([1, 2, 3]), fileName: "a.jpg" });
    expect((calls[0].init!.body as FormData).has("caption")).toBe(false);
  });

  it("cắt caption ở 2000 ký tự", async () => {
    const calls = mockFetch(200, { ok: true, result: {} });
    await client().sendPhoto({ chatId: "g", image: Buffer.from([1]), fileName: "a.jpg", caption: "x".repeat(3000) });
    expect(((calls[0].init!.body as FormData).get("caption") as string).length).toBe(2000);
  });

  it("ảnh quá 9MB được nén lại để dưới giới hạn 10MB", async () => {
    const calls = mockFetch(200, { ok: true, result: {} });
    // ảnh nhiễu ngẫu nhiên nén rất kém nên dễ vượt 9MB
    const raw = Buffer.alloc(3200 * 3200 * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
    const big = await sharp(raw, { raw: { width: 3200, height: 3200, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
    expect(big.length).toBeGreaterThan(9 * 1024 * 1024);
    await client().sendPhoto({ chatId: "g", image: big, fileName: "big.png" });
    const photo = (calls[0].init!.body as FormData).get("photo") as File;
    expect(photo.size).toBeLessThan(9 * 1024 * 1024);
    expect(photo.name).toBe("big.jpg");
  });
});

describe("lỗi từ Zalo", () => {
  it("phân loại theo bảng mã lỗi, chỉ 503/403/5xx/mạng là thử lại được", () => {
    for (const code of [400, 401, 410, 422, 423, 424, 429]) expect(classifyZaloError(code).retryable).toBe(false);
    for (const code of [503, 403, 500]) expect(classifyZaloError(code).retryable).toBe(true);
    expect(classifyZaloError(429).message).toMatch(/hạn mức/);
    expect(classifyZaloError(422).message).toMatch(/không được phép gửi/);
  });

  it("lấy mã lỗi từ nội dung hoặc mã HTTP", async () => {
    mockFetch(424, { ok: false, error_code: 424, description: "Invalid image" });
    const err = await client().sendMessage("g", "hi").catch((e) => e);
    expect(err).toBeInstanceOf(ZaloError);
    expect(err.code).toBe(424);
    expect(err.message).toContain("Invalid image");
  });

  it("HTTP 200 nhưng ok=false vẫn là lỗi", async () => {
    mockFetch(200, { ok: false, error_code: 429, description: "quota" });
    await expect(client().sendMessage("g", "hi")).rejects.toMatchObject({ code: 429, retryable: false });
  });

  it("lỗi mạng thì thử lại được và KHÔNG lộ token trong thông báo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed https://api.example/botTOKEN123/sendMessage"))));
    const err = await client().sendMessage("g", "hi").catch((e) => e);
    expect(err.retryable).toBe(true);
    expect(err.message).not.toContain("TOKEN123");
  });
});

describe("ZaloClient khác", () => {
  it("sendMessage gửi JSON chat_id và text", async () => {
    const calls = mockFetch(200, { ok: true, result: { message_id: "x" } });
    await client().sendMessage("g1", "Xin chào");
    expect(calls[0].url).toBe("https://api.example/botTOKEN123/sendMessage");
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({ chat_id: "g1", text: "Xin chào" });
  });

  it("setWebhook gửi url và secret_token", async () => {
    const calls = mockFetch(200, { ok: true, result: { url: "https://x/y" } });
    await client().setWebhook("https://x/y", "secret-123456");
    expect(calls[0].url).toBe("https://api.example/botTOKEN123/setWebhook");
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({ url: "https://x/y", secret_token: "secret-123456" });
  });
});

describe("bộ đếm hạn mức tin tháng (D133)", () => {
  const metered = () => {
    const events: string[] = [];
    return { events, c: new ZaloClient("TOKEN123", "https://api.example", (e) => events.push(e)) };
  };

  it("mỗi tin chữ, ảnh, file gửi thành công được đếm 1 tin", async () => {
    mockFetch(200, { ok: true, result: { message_id: "m" } });
    const { events, c } = metered();
    await c.sendMessage("g", "hi");
    await c.sendPhoto({ chatId: "g", image: Buffer.from([1, 2, 3]), fileName: "a.jpg" });
    await c.sendFile({ chatId: "g", data: Buffer.from([1]), fileName: "a.pdf" });
    expect(events).toEqual(["sent", "sent", "sent"]);
  });

  it("kiểm tra token, đăng ký webhook, hiệu ứng đang soạn tin không tốn hạn mức nên không đếm", async () => {
    mockFetch(200, { ok: true, result: {} });
    const { events, c } = metered();
    await c.getMe();
    await c.setWebhook("https://x/y", "secret-123456");
    await c.sendTyping("g");
    expect(events).toEqual([]);
  });

  it("Zalo trả 429 thì ghi nhận hết hạn mức, không đếm là đã gửi", async () => {
    mockFetch(200, { ok: false, error_code: 429, description: "quota" });
    const { events, c } = metered();
    await expect(c.sendMessage("g", "hi")).rejects.toMatchObject({ code: 429 });
    expect(events).toEqual(["quota"]);
  });

  it("lỗi khác (422, mạng) không đếm gì", async () => {
    const { events, c } = metered();
    mockFetch(422, { ok: false, error_code: 422 });
    await expect(c.sendMessage("g", "hi")).rejects.toMatchObject({ code: 422 });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(c.sendMessage("g", "hi")).rejects.toMatchObject({ retryable: true });
    expect(events).toEqual([]);
  });

  it("bộ đếm hỏng không làm hỏng việc gửi", async () => {
    mockFetch(200, { ok: true, result: { message_id: "m" } });
    const c = new ZaloClient("TOKEN123", "https://api.example", () => {
      throw new Error("đếm hỏng");
    });
    await expect(c.sendMessage("g", "hi")).resolves.toEqual({ message_id: "m" });
  });
});

describe("caption", () => {
  it("ghép thương hiệu, nhãn ảnh, sale và link (nếu có)", () => {
    const c = buildCaption({ brandName: "Nextgency", customerName: "Anh Hùng", label: "Ảnh 1 · Trang A", saleName: "Lan", sessionUrl: "https://a/b" });
    expect(c).toBe("Nextgency · Anh Hùng\nẢnh 1 · Trang A\nSale: Lan\nhttps://a/b");
  });

  it("không tạo link khi APP_URL không phải https", () => {
    expect(publicSessionUrl("http://localhost:3000", "s1")).toBeUndefined();
    expect(publicSessionUrl("https://app.example.com/", "s1")).toBe("https://app.example.com/sessions/s1");
  });

  it("không vượt 2000 ký tự", () => {
    expect(buildCaption({ brandName: "x".repeat(3000), customerName: "c", label: "l", saleName: "s" }).length).toBe(2000);
  });
});
