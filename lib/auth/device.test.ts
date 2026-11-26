import { describe, expect, it } from "vitest";
import { deviceLabel } from "./device";

describe("deviceLabel", () => {
  it("nhận ra Chrome trên Windows", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")).toBe("Chrome trên Windows");
  });

  it("Edge và Cốc Cốc không bị nhận nhầm thành Chrome", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0")).toBe("Edge trên Windows");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) coc_coc_browser/120.0 Chrome/126.0.0.0 Safari/537.36")).toBe("Cốc Cốc trên Windows");
  });

  it("nhận ra Safari trên iPhone và Chrome trên Android", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1")).toBe("Safari trên iPhone");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36")).toBe("Chrome trên Android");
  });

  it("nhận ra Safari trên máy Mac và Firefox trên Linux", () => {
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15")).toBe("Safari trên máy Mac");
    expect(deviceLabel("Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0")).toBe("Firefox trên Linux");
  });

  it("thiếu hoặc lạ thì báo không rõ, không ném lỗi", () => {
    expect(deviceLabel(null)).toBe("Thiết bị không rõ");
    expect(deviceLabel("   ")).toBe("Thiết bị không rõ");
    expect(deviceLabel("curl/8.4.0")).toBe("Thiết bị không rõ");
  });
});
