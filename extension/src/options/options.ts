import type { BackgroundMessage, StatusResponse } from "../types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const send = <T>(msg: BackgroundMessage) => chrome.runtime.sendMessage(msg) as Promise<T>;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function setMessage(text: string, kind: "good" | "err" | "") {
  const el = $("message");
  el.textContent = text;
  el.className = kind;
}

async function refresh() {
  const s = await send<StatusResponse>({ type: "GET_STATUS" });
  $("origin").textContent = s.appOrigin;
  $("current").innerHTML = s.connected && s.account ? `<b class="good">Đã kết nối:</b> ${esc(s.user ?? "")} · nick ${esc(s.account.display_name)}` : `<b class="err">Chưa kết nối.</b> ${s.error ? esc(s.error) : ""}`;
  $("disconnect").hidden = !s.connected;
}

$("save").addEventListener("click", async () => {
  const input = $("token") as HTMLInputElement;
  const token = input.value.trim();
  if (!token) return setMessage("Hãy dán mã kết nối.", "err");
  setMessage("Đang kiểm tra...", "");
  const r = await send<{ ok: boolean; message: string }>({ type: "CONNECT", token });
  if (r.ok) input.value = "";
  setMessage(r.message, r.ok ? "good" : "err");
  await refresh();
});

$("disconnect").addEventListener("click", async () => {
  await send({ type: "DISCONNECT" });
  setMessage("Đã ngắt kết nối và xoá mã khỏi extension.", "good");
  await refresh();
});

void refresh();
