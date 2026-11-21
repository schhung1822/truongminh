import type { CycleSummary } from "./types";

/**
 * Chỗ lưu của extension (chrome.storage.local, chỉ extension đọc được). Chỉ giữ: mã kết nối, kết quả chu kỳ gần nhất,
 * trạng thái đang chạy. KHÔNG lưu comment hay số điện thoại: chúng chỉ nằm tạm trong bộ nhớ khi quét rồi gửi đi.
 */
const K = { token: "token", lastCycle: "lastCycle", error: "error", cycleStartedAt: "cycleStartedAt" } as const;

async function get<T>(key: string): Promise<T | null> {
  const r = await chrome.storage.local.get(key);
  return (r[key] as T | undefined) ?? null;
}

export const store = {
  getToken: () => get<string>(K.token),
  setToken: (t: string) => chrome.storage.local.set({ [K.token]: t }),
  clearToken: () => chrome.storage.local.remove([K.token, K.error]),
  getLastCycle: () => get<CycleSummary>(K.lastCycle),
  setLastCycle: (c: CycleSummary) => chrome.storage.local.set({ [K.lastCycle]: c }),
  getError: () => get<string>(K.error),
  setError: (e: string | null) => (e ? chrome.storage.local.set({ [K.error]: e }) : chrome.storage.local.remove(K.error)),
  getCycleStartedAt: () => get<number>(K.cycleStartedAt),
  setCycleStartedAt: (t: number | null) => (t ? chrome.storage.local.set({ [K.cycleStartedAt]: t }) : chrome.storage.local.remove(K.cycleStartedAt)),
};
