import type { BackgroundMessage, DiagnosticReport, Settings, SimpleResult, StatusResponse } from "../types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function send<T>(msg: BackgroundMessage): Promise<T> {
  const r = (await chrome.runtime.sendMessage(msg)) as T | undefined;
  if (r === undefined) throw new Error("Extension không phản hồi. Vào chrome://extensions bấm nút tải lại của Data Lead Facebook.");
  return r;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function setMsg(id: string, text: string, kind: "good" | "err" | "" = "") {
  const el = $(id);
  el.textContent = text;
  el.className = "msg " + kind;
}

async function refresh() {
  try {
    const s = await send<StatusResponse>({ type: "GET_STATUS" });
    $("origin").textContent = s.appOrigin;
    $("version").textContent = "v" + s.version;
    $("version2").textContent = s.version;
    $("current").innerHTML =
      s.connected && s.account
        ? `<b class="good">Đã kết nối.</b> Nhân sự: ${esc(s.user ?? "")} · nick Facebook: <b>${esc(s.account.display_name)}</b>${s.account.status !== "ACTIVE" ? ` <span class="warn">(nick đang ${s.account.status === "PAUSED" ? "tạm dừng" : "bị hạn chế"} trên webapp)</span>` : ""}`
        : `<b class="err">Chưa kết nối.</b> ${s.error ? esc(s.error) : ""}`;
    $("disconnect").hidden = !s.connected;
    (document.querySelector<HTMLInputElement>(`input[name="scanMode"][value="${s.settings.scanMode}"]`) ?? null)?.toggleAttribute("checked", true);
    for (const r of document.querySelectorAll<HTMLInputElement>('input[name="scanMode"]')) r.checked = r.value === s.settings.scanMode;
    ($("notifyLeads") as HTMLInputElement).checked = s.settings.notifyLeads;
  } catch (e) {
    $("current").innerHTML = `<b class="err">${esc(e instanceof Error ? e.message : String(e))}</b>`;
  }
  const report = await send<DiagnosticReport | null>({ type: "GET_LAST_DIAGNOSTIC" }).catch(() => null);
  ($("report") as HTMLTextAreaElement).value = report ? JSON.stringify(report, null, 2) : "";
}

$("save").addEventListener("click", async () => {
  const input = $("token") as HTMLInputElement;
  const token = input.value.trim();
  if (!token) return setMsg("message", "Hãy dán mã kết nối vào ô trên.", "err");
  setMsg("message", "Đang kiểm tra mã với webapp...");
  ($("save") as HTMLButtonElement).disabled = true;
  try {
    const r = await send<SimpleResult>({ type: "CONNECT", token });
    if (r.ok) input.value = "";
    setMsg("message", r.message, r.ok ? "good" : "err");
  } catch (e) {
    setMsg("message", e instanceof Error ? e.message : String(e), "err");
  } finally {
    ($("save") as HTMLButtonElement).disabled = false;
    await refresh();
  }
});

$("check").addEventListener("click", async () => {
  setMsg("message", "Đang kiểm tra...");
  await refresh();
  setMsg("message", "Đã kiểm tra lại (xem dòng trạng thái phía trên).", "good");
});

$("disconnect").addEventListener("click", async () => {
  try {
    await send<SimpleResult>({ type: "DISCONNECT" });
    setMsg("message", "Đã ngắt kết nối và xoá mã khỏi máy này. Extension ngừng quét cho tới khi dán mã mới.", "good");
  } catch (e) {
    setMsg("message", e instanceof Error ? e.message : String(e), "err");
  }
  await refresh();
});

async function saveSettings(patch: Partial<Settings>) {
  try {
    await send<Settings>({ type: "SET_SETTINGS", settings: patch });
    setMsg("settingsMsg", "Đã lưu thiết lập.", "good");
  } catch (e) {
    setMsg("settingsMsg", e instanceof Error ? e.message : String(e), "err");
  }
}
for (const r of document.querySelectorAll<HTMLInputElement>('input[name="scanMode"]')) {
  r.addEventListener("change", () => void saveSettings({ scanMode: r.value as Settings["scanMode"] }));
}
$("notifyLeads").addEventListener("change", (e) => void saveSettings({ notifyLeads: (e.target as HTMLInputElement).checked }));

$("copyReport").addEventListener("click", async () => {
  const text = ($("report") as HTMLTextAreaElement).value;
  if (!text) return setMsg("reportMsg", "Chưa có báo cáo nào.", "err");
  try {
    await navigator.clipboard.writeText(text);
    setMsg("reportMsg", "Đã sao chép. Dán vào tin nhắn gửi người phát triển.", "good");
  } catch {
    ($("report") as HTMLTextAreaElement).select();
    setMsg("reportMsg", "Không sao chép tự động được; nội dung đã được bôi đen, bấm Ctrl+C.", "err");
  }
});

void refresh();
