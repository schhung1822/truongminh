import { describe, expect, it } from "vitest";
import { estimateCost } from "./pricing";

describe("estimateCost", () => {
  it("1 ảnh 2K = 10 credits = 0,05 USD", () => {
    expect(estimateCost(["2K"])).toEqual({ credits: 10, usd: 0.05 });
  });

  it("cộng dồn theo từng độ phân giải", () => {
    expect(estimateCost(["1K", "2K", "4K"])).toEqual({ credits: 32, usd: 0.16 });
  });

  it("10 trang 2K (80 chất liệu) = 100 credits = 0,50 USD", () => {
    expect(estimateCost(Array(10).fill("2K"))).toEqual({ credits: 100, usd: 0.5 });
  });

  it("độ phân giải lạ không làm sai tổng", () => {
    expect(estimateCost(["2K", "8K"]).credits).toBe(10);
  });
});
