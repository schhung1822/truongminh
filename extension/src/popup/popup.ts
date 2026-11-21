import type { BackgroundMessage, StatusResponse } from "../types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const send = <T>(msg: BackgroundMessage) => chrome.runtime.sendMessage(msg) as Promise<T>;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

const fmt = (iso: string) => new Date(iso).toLocaleString("vi-VN", { hour12: false });
const ACCOUNT_STATUS = { ACTIVE: "đang hoạt động", PAUSED: "tạm dừng", RESTRICTED: "bị hạn chế" } as const;

function setMessage(text: string, kind: "ok" | "error" | "" = "") {
  const el = $("message");
  el.textContent = text;
  el.className = "message" + (kind ? " " + kind : "");
}

function render(s: StatusResponse) {
  const status = $("status");
  if (s.connected && s.account) {
    status.innerHTML = `<b class="good">Đã kết nối</b><br>${esc(s.user ?? "")} · ${esc(s.account.display_name)}<br><span class="muted">Nick ${ACCOUNT_STATUS[s.account.status]} · ${esc(s.appOrigin)}</span>`;
  } else {
    status.innerHTML = `<b class="err">Chưa kết nối</b><br>${s.error ? esc(s.error) : "Mở Cài đặt và nhập mã kết nối lấy từ webapp (Lead Facebook > Kết nối extension)."}`;
  }

  const cycle = $("cycle");
  if (s.lastCycle) {
    const c = s.lastCycle;
    cycle.hidden = false;
    cycle.innerHTML =
      `Lần quét gần nhất: ${esc(fmt(c.at))}<br>${c.posts} bài · ${c.newComments} comment mới · ${c.newLeads} lead mới` +
      (c.error ? `<br><span class="err">${esc(c.error)}</span>` : "") +
      (s.running ? "<br><i>Đang quét...</i>" : "");
  } else {
    cycle.hidden = true;
  }

  const ok = s.connected && s.account?.status === "ACTIVE";
  ($("runNow") as HTMLButtonElement).disabled = !ok || s.running;
  ($("follow") as HTMLButtonElement).disabled = !s.connected;
}

async function refresh() {
  try {
    render(await send<StatusResponse>({ type: "GET_STATUS" }));
  } catch {
    $("status").textContent = "Không liên lạc được với extension. Tải lại tiện ích ở chrome://extensions.";
  }
}

$("runNow").addEventListener("click", async () => {
  setMessage("");
  const r = await send<{ started: boolean }>({ type: "RUN_NOW" });
  setMessage(r.started ? "Đang quét các bài theo dõi, mỗi lần một bài. Có thể đóng cửa sổ này." : "Đang có một lần quét chạy rồi.", r.started ? "ok" : "");
  setTimeout(() => void refresh(), 1500);
});

$("follow").addEventListener("click", async () => {
  setMessage("");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return setMessage("Không tìm thấy tab đang mở.", "error");
  const r = await send<{ ok: boolean; message: string }>({ type: "FOLLOW_ACTIVE_TAB", tabId: tab.id });
  setMessage(r.message, r.ok ? "ok" : "error");
});

$("settings").addEventListener("click", () => void chrome.runtime.openOptionsPage());

void refresh();
