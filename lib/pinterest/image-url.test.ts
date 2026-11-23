import { describe, expect, it } from "vitest";
import { isPinterestImageUrl } from "./image-url";

describe("isPinterestImageUrl", () => {
  it("chỉ nhận HTTPS từ CDN pinimg chính thức", () => {
    expect(isPinterestImageUrl("https://i.pinimg.com/1200x/aa/bb/image.jpg")).toBe(true);
    expect(isPinterestImageUrl("https://images.pinimg.com/image.webp")).toBe(true);
    expect(isPinterestImageUrl("http://i.pinimg.com/image.jpg")).toBe(false);
    expect(isPinterestImageUrl("https://pinimg.com.evil.example/image.jpg")).toBe(false);
    expect(isPinterestImageUrl("https://127.0.0.1/internal")).toBe(false);
    expect(isPinterestImageUrl("not-a-url")).toBe(false);
  });
});
