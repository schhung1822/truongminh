import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeTask, MockProvider, parseGridFromPrompt } from "./mock";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const base = {
  model: "m",
  inputUrls: ["a", "b"],
  aspectRatio: "2:3",
  resolution: "1K",
};

describe("parseGridFromPrompt", () => {
  it("đọc cột, hàng và số ô có chất liệu từ prompt catalog", () => {
    const p = "Create one sheet as a strict grid of 2 columns and 5 rows, equal cells.\nCell 1 = reference image 2: a, technique: b\nCell 2 = reference image 3: a, technique: b";
    expect(parseGridFromPrompt(p)).toEqual({ cols: 2, rows: 5, count: 2 });
  });

  it("prompt thiết kế (không có lưới) là một ảnh", () => {
    expect(parseGridFromPrompt("make a mug")).toEqual({ cols: 1, rows: 1, count: 1 });
  });
});

describe("MockProvider", () => {
  it("tác vụ đang xử lý rồi thành công sau độ trễ, trạng thái nằm trong taskId", async () => {
    vi.stubEnv("MOCK_DELAY_MS", "1000");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const provider = new MockProvider();
    const { taskId } = await provider.createTask({ ...base, prompt: "grid of 2 columns and 5 rows" });
    expect((await provider.getTask(taskId)).status).toBe("PROCESSING");
    vi.setSystemTime(new Date("2026-01-01T00:00:05Z"));
    const done = await provider.getTask(taskId);
    expect(done.status).toBe("SUCCESS");
    expect(done.resultUrl).toBe(`mock-result://${taskId}`);
  });

  it("chèn [[mock-fail]] vào prompt thì tác vụ lỗi", async () => {
    vi.stubEnv("MOCK_DELAY_MS", "0");
    const provider = new MockProvider();
    const { taskId } = await provider.createTask({ ...base, prompt: "x [[mock-fail]]" });
    expect(decodeTask(taskId).f).toBe(1);
    await new Promise((r) => setTimeout(r, 30));
    expect((await provider.getTask(taskId)).status).toBe("FAILED");
  });

  it("ảnh kết quả đúng tỉ lệ và độ phân giải yêu cầu", async () => {
    vi.stubEnv("MOCK_DELAY_MS", "0");
    const provider = new MockProvider();
    const { taskId } = await provider.createTask({ ...base, prompt: "grid of 2 columns and 5 rows" });
    const { buffer, contentType } = await provider.downloadResult(`mock-result://${taskId}`);
    const meta = await sharp(buffer).metadata();
    expect(contentType).toBe("image/png");
    expect(meta.width).toBe(683); // 2:3 ở 1K: cạnh dài 1024
    expect(meta.height).toBe(1024);
  });
});
