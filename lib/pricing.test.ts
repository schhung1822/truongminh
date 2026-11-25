import { describe, expect, it } from "vitest";
import { estimateCost } from "./pricing";

const SUNBURST = "gpt-image-2-5-sunburst-image-to-image";

describe("estimateCost", () => {
  it("1 ảnh 2K = 10 credits = 0,05 USD", () => {
    expect(estimateCost(SUNBURST, ["2K"])).toEqual({ credits: 10, usd: 0.05, unknown: false });
  });

  it("cộng dồn theo từng độ phân giải", () => {
    expect(estimateCost(SUNBURST, ["1K", "2K", "4K"])).toEqual({ credits: 32, usd: 0.16, unknown: false });
  });

  it("10 trang 2K (80 chất liệu) = 100 credits = 0,50 USD", () => {
    expect(estimateCost(SUNBURST, Array(10).fill("2K"))).toEqual({ credits: 100, usd: 0.5, unknown: false });
  });

  it("độ phân giải lạ không làm sai tổng, nhưng đánh dấu unknown", () => {
    const r = estimateCost(SUNBURST, ["2K", "8K"]);
    expect(r.credits).toBe(10);
    expect(r.unknown).toBe(true);
  });

  it("model lạ (không có trong danh mục) trả credits 0 và unknown", () => {
    expect(estimateCost("model-chua-biet", ["2K"])).toEqual({ credits: 0, usd: 0, unknown: true });
  });

  it("model tính theo token (GPT Image 2.6) luôn unknown vì không có credit cố định theo ảnh", () => {
    const r = estimateCost("gpt-image-2-6/flare-image-to-image", ["1K", "2K"]);
    expect(r.unknown).toBe(true);
  });

  it("model khác giá khác model GPT Image mặc định (Nano Banana 2)", () => {
    expect(estimateCost("nano-banana-2", ["1K", "2K", "4K"])).toEqual({ credits: 38, usd: 0.19, unknown: false });
  });

  it("model không hỗ trợ độ phân giải đó (Qwen 2.1 không có 4K) thì đánh dấu unknown cho phần đó", () => {
    const r = estimateCost("qwen2-1/image-to-image", ["2K", "4K"]);
    expect(r.credits).toBe(8);
    expect(r.unknown).toBe(true);
  });
});
