import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildAuthorizeUrl, listBoardPins, listBoards } from "./client";

describe("buildAuthorizeUrl", () => {
  it("dựng đúng địa chỉ xác nhận quyền với đủ tham số bắt buộc", () => {
    const url = buildAuthorizeUrl({ clientId: "123", redirectUri: "https://example.com/api/pinterest/oauth/callback", state: "abc" });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://www.pinterest.com/oauth/");
    expect(parsed.searchParams.get("client_id")).toBe("123");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://example.com/api/pinterest/oauth/callback");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("state")).toBe("abc");
    expect(parsed.searchParams.get("scope")).toContain("boards:read");
    expect(parsed.searchParams.get("scope")).not.toContain("pins:read_secret");
  });

  it("chỉ xin quyền board bí mật khi cấu hình bật rõ ràng", () => {
    const url = buildAuthorizeUrl({
      clientId: "123",
      redirectUri: "https://example.com/callback",
      state: "abc",
      scopes: ["boards:read", "pins:read", "boards:read_secret", "pins:read_secret"],
    });
    expect(new URL(url).searchParams.get("scope")).toContain("pins:read_secret");
  });
});

describe("Pinterest API pagination", () => {
  it("gửi page_size tối đa và bookmark khi liệt kê board", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], bookmark: null }), { status: 200 }),
    );
    await listBoards("access-token", "next page");
    const [raw, init] = fetchMock.mock.calls[0];
    const url = new URL(String(raw));
    expect(url.pathname).toBe("/v5/boards");
    expect(url.searchParams.get("page_size")).toBe("250");
    expect(url.searchParams.get("bookmark")).toBe("next page");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer access-token");
    fetchMock.mockRestore();
  });

  it("mã hóa board id và bookmark khi liệt kê pin", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], bookmark: null }), { status: 200 }),
    );
    await listBoardPins("token", "board/id", "bookmark");
    const [raw] = fetchMock.mock.calls[0];
    const url = new URL(String(raw));
    expect(url.pathname).toBe("/v5/boards/board%2Fid/pins");
    expect(url.searchParams.get("bookmark")).toBe("bookmark");
    fetchMock.mockRestore();
  });
});
