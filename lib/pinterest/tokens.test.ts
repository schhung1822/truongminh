import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PinterestAccount } from "@/generated/prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/crypto/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `decoded:${value}`),
  encryptSecret: vi.fn((value: string) => `encoded:${value}`),
}));
vi.mock("@/lib/db", () => ({
  db: { pinterestAccount: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, refreshAccessToken: vi.fn() };
});

import { db } from "@/lib/db";
import { PinterestApiError, refreshAccessToken } from "./client";
import { withAutoRefresh } from "./tokens";

const config = { clientId: "client", clientSecret: "secret", redirectUri: "https://example.com/callback", scopes: ["boards:read", "pins:read"] };
const future = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

function account(overrides: Partial<PinterestAccount> = {}): PinterestAccount {
  return {
    id: "account-1",
    pinterestUserId: "p-user",
    username: "user",
    profileImageUrl: null,
    accessTokenEnc: "access-current",
    refreshTokenEnc: "refresh-current",
    accessTokenExpiresAt: future(),
    refreshTokenExpiresAt: future(),
    scope: "boards:read pins:read",
    connectedById: "admin",
    lastSyncedAt: null,
    lastSyncError: null,
    feedError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("withAutoRefresh", () => {
  beforeEach(() => vi.clearAllMocks());

  it("đọc token mới nhất trong CSDL thay vì object cũ của đầu lượt đồng bộ", async () => {
    vi.mocked(db.pinterestAccount.findUnique).mockResolvedValue(account({ accessTokenEnc: "access-newest" }));
    const run = vi.fn(async (token: string) => token);

    const result = await withAutoRefresh(account({ accessTokenEnc: "access-stale" }), config, run);

    expect(result).toBe("decoded:access-newest");
    expect(run).toHaveBeenCalledWith("decoded:access-newest");
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it("khi API trả 401, dùng refresh token mới nhất rồi thử lại đúng một lần", async () => {
    vi.mocked(db.pinterestAccount.findUnique)
      .mockResolvedValueOnce(account({ accessTokenEnc: "access-1", refreshTokenEnc: "refresh-1" }))
      .mockResolvedValueOnce(account({ refreshTokenEnc: "refresh-2" }));
    vi.mocked(refreshAccessToken).mockResolvedValue({
      access_token: "access-fresh",
      refresh_token: "refresh-fresh",
      token_type: "bearer",
      expires_in: 2_592_000,
      refresh_token_expires_in: 5_184_000,
      scope: "boards:read pins:read",
    });
    const run = vi.fn()
      .mockRejectedValueOnce(new PinterestApiError("expired", 401))
      .mockResolvedValueOnce("ok");

    await expect(withAutoRefresh(account(), config, run)).resolves.toBe("ok");
    expect(refreshAccessToken).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: "decoded:refresh-2" }));
    expect(run).toHaveBeenNthCalledWith(2, "access-fresh");
    expect(db.pinterestAccount.update).toHaveBeenCalledOnce();
  });
});
