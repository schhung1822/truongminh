import { afterEach, describe, expect, it, vi } from "vitest";
import { KieProvider, classifyError } from "./kie";
import { ProviderFatalError } from "./types";

const provider = () => new KieProvider("test-key", "https://api.example", "https://upload.example");

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const out = handler(url, init);
      return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("KieProvider.createTask", () => {
  it("gửi đúng endpoint, header, tên trường input_urls và thứ tự ảnh", async () => {
    const calls = mockFetch(() => ({ code: 200, msg: "success", data: { taskId: "task_1" } }));
    const r = await provider().createTask({
      model: "gpt-image-2-5-sunburst-image-to-image",
      prompt: "p",
      inputUrls: ["https://x/logo.png", "https://x/m1.jpg", "https://x/m2.jpg"],
      aspectRatio: "2:3",
      resolution: "2K",
      callbackUrl: "https://app.example/api/webhooks/kie",
    });
    expect(r.taskId).toBe("task_1");
    expect(calls[0].url).toBe("https://api.example/api/v1/jobs/createTask");
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const body = JSON.parse(calls[0].init!.body as string);
    expect(body).toEqual({
      model: "gpt-image-2-5-sunburst-image-to-image",
      callBackUrl: "https://app.example/api/webhooks/kie",
      input: {
        prompt: "p",
        input_urls: ["https://x/logo.png", "https://x/m1.jpg", "https://x/m2.jpg"],
        aspect_ratio: "2:3",
        resolution: "2K",
      },
    });
    expect(body.input.image_urls).toBeUndefined();
  });

  it("không gửi callBackUrl khi không bật callback", async () => {
    const calls = mockFetch(() => ({ code: 200, data: { taskId: "t" } }));
    await provider().createTask({ model: "m", prompt: "p", inputUrls: [], aspectRatio: "1:1", resolution: "1K" });
    expect(JSON.parse(calls[0].init!.body as string).callBackUrl).toBeUndefined();
  });

  it("HTTP 200 nhưng code 402 -> lỗi không thử lại, báo hết credits", async () => {
    mockFetch(() => ({ code: 402, msg: "Insufficient credits" }));
    const p = provider().createTask({ model: "m", prompt: "p", inputUrls: [], aspectRatio: "1:1", resolution: "1K" });
    await expect(p).rejects.toBeInstanceOf(ProviderFatalError);
    await expect(p).rejects.toThrow(/hết credits/);
  });

  it("code 429 hoặc 500 -> lỗi có thể thử lại (không phải ProviderFatalError)", async () => {
    mockFetch(() => ({ code: 429, msg: "slow down" }));
    const err = await provider()
      .createTask({ model: "m", prompt: "p", inputUrls: [], aspectRatio: "1:1", resolution: "1K" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ProviderFatalError);
  });

  it("chặn trước khi gọi nếu quá 16 ảnh hoặc prompt quá dài", async () => {
    const calls = mockFetch(() => ({ code: 200, data: { taskId: "t" } }));
    await expect(
      provider().createTask({ model: "m", prompt: "p", inputUrls: Array(17).fill("u"), aspectRatio: "1:1", resolution: "1K" }),
    ).rejects.toBeInstanceOf(ProviderFatalError);
    await expect(
      provider().createTask({ model: "m", prompt: "x".repeat(20001), inputUrls: [], aspectRatio: "1:1", resolution: "1K" }),
    ).rejects.toBeInstanceOf(ProviderFatalError);
    expect(calls).toHaveLength(0);
  });
});

describe("KieProvider.getTask", () => {
  const rec = (data: object) => mockFetch(() => ({ code: 200, msg: "success", data }));

  it("waiting/queuing/generating -> đang xử lý", async () => {
    for (const state of ["waiting", "queuing", "generating"]) {
      rec({ state });
      expect((await provider().getTask("t")).status).toBe("PROCESSING");
    }
  });

  it("success -> lấy URL đầu tiên trong resultJson và credits", async () => {
    const calls = rec({
      state: "success",
      resultJson: JSON.stringify({ resultUrls: ["https://cdn/a.png", "https://cdn/b.png"] }),
      creditsConsumed: 10,
    });
    const r = await provider().getTask("task 1");
    expect(r).toEqual({ status: "SUCCESS", resultUrl: "https://cdn/a.png", credits: 10 });
    expect(calls[0].url).toBe("https://api.example/api/v1/jobs/recordInfo?taskId=task%201");
  });

  it("success nhưng không có ảnh -> thất bại", async () => {
    rec({ state: "success", resultJson: "{}" });
    expect((await provider().getTask("t")).status).toBe("FAILED");
  });

  it("fail -> thất bại kèm lý do và mã", async () => {
    rec({ state: "fail", failMsg: "content policy", failCode: "500" });
    const r = await provider().getTask("t");
    expect(r.status).toBe("FAILED");
    expect(r.error).toMatch(/content policy.*500/);
  });

  it("tác vụ không tồn tại (422) -> thất bại, không ném lỗi", async () => {
    mockFetch(() => ({ code: 422, msg: "task not found" }));
    expect((await provider().getTask("t")).status).toBe("FAILED");
  });
});

describe("KieProvider.uploadReference", () => {
  it("upload multipart tới kho kie, trả URL và hạn ~23 giờ", async () => {
    const calls = mockFetch(() => ({ code: 200, data: { downloadUrl: "https://tmp/file.png" } }));
    const r = await provider().uploadReference({ buffer: Buffer.from("x"), fileName: "logo-abc.png", contentType: "image/png" });
    expect(r.url).toBe("https://tmp/file.png");
    expect(calls[0].url).toBe("https://upload.example/api/file-stream-upload");
    const form = calls[0].init!.body as FormData;
    expect(form.get("uploadPath")).toBe("logo-mockup/references");
    expect(String(form.get("fileName"))).toMatch(/^logo-abc-[a-z0-9]+\.png$/);
    const ms = r.expiresAt!.getTime() - Date.now();
    expect(ms).toBeGreaterThan(22 * 3600_000);
    expect(ms).toBeLessThanOrEqual(23 * 3600_000);
    expect((calls[0].init!.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });
});

describe("classifyError", () => {
  it("401 và 402 không thử lại, 5xx thì có", () => {
    expect(classifyError(401)).toBeInstanceOf(ProviderFatalError);
    expect(classifyError(402)).toBeInstanceOf(ProviderFatalError);
    expect(classifyError(500, "x")).not.toBeInstanceOf(ProviderFatalError);
  });
});
