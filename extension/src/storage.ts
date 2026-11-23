import { DEFAULT_SETTINGS, type CycleSummary, type DiagnosticReport, type EventEntry, type EventLevel, type Progress, type Settings } from "./types";

/**
 * Chỗ lưu của extension (chrome.storage.local, chỉ extension đọc được). Chỉ giữ: mã kết nối, thiết lập, kết quả chu kỳ gần nhất,
 * tiến độ, nhật ký ngắn (không có dữ liệu cá nhân) và báo cáo chẩn đoán gần nhất.
 * KHÔNG lưu comment hay số điện thoại: chúng chỉ nằm tạm trong bộ nhớ khi quét rồi gửi đi.
 */
const K = {
  token: "token",
  settings: "settings",
  lastCycle: "lastCycle",
  error: "error",
  progress: "progress",
  events: "events",
  lastDiagnostic: "lastDiagnostic",
} as const;

const MAX_EVENTS = 40;

async function get<T>(key: string): Promise<T | null> {
  const r = await chrome.storage.local.get(key);
  return (r[key] as T | undefined) ?? null;
}

export const store = {
  getToken: () => get<string>(K.token),
  setToken: (t: string) => chrome.storage.local.set({ [K.token]: t }),
  clearToken: () => chrome.storage.local.remove([K.token, K.error, K.lastCycle, K.progress]),

  async getSettings(): Promise<Settings> {
    const s = await get<Partial<Settings>>(K.settings);
    return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  },
  async setSettings(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await store.getSettings()), ...patch };
    await chrome.storage.local.set({ [K.settings]: next });
    return next;
  },

  getLastCycle: () => get<CycleSummary>(K.lastCycle),
  setLastCycle: (c: CycleSummary) => chrome.storage.local.set({ [K.lastCycle]: c }),
  getError: () => get<string>(K.error),
  setError: (e: string | null) => (e ? chrome.storage.local.set({ [K.error]: e }) : chrome.storage.local.remove(K.error)),
  getProgress: () => get<Progress>(K.progress),
  setProgress: (p: Progress) => (p ? chrome.storage.local.set({ [K.progress]: p }) : chrome.storage.local.remove(K.progress)),

  getEvents: async () => (await get<EventEntry[]>(K.events)) ?? [],
  /** Ghi một dòng nhật ký ngắn cho người dùng xem trong popup. Không ghi tên, số điện thoại hay nội dung comment. */
  async addEvent(level: EventLevel, text: string): Promise<void> {
    const list = await store.getEvents();
    list.unshift({ at: new Date().toISOString(), level, text: text.slice(0, 300) });
    await chrome.storage.local.set({ [K.events]: list.slice(0, MAX_EVENTS) });
  },
  clearEvents: () => chrome.storage.local.remove(K.events),

  getLastDiagnostic: () => get<DiagnosticReport>(K.lastDiagnostic),
  setLastDiagnostic: (d: DiagnosticReport) => chrome.storage.local.set({ [K.lastDiagnostic]: d }),
};
