import type { BackgroundMessage, DiagnosticReport, EventEntry, SimpleResult, StatusResponse } from "../types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Gửi tin cho background; background luôn trả lời, nhưng nếu service worker lỗi nặng thì vẫn ra thông báo thay vì im lặng. */
async function send<T>(msg: BackgroundMessage): Promise<T> {
  const r = (await chrome.runtime.sendMessage(msg)) as T | undefined;
  if (r === undefined) throw new Error("Extension không phản hồi. Vào chrome://extensions bấm nút tải lại của Data Lead Facebook.");
  return r;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { hour12: false, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ACCOUNT_STATUS = { ACTIVE: "đang hoạt động", PAUSED: "tạm dừng trên webapp", RESTRICTED: "bị hạn chế (chờ quản trị viên bật lại)" } as const;

let refreshTimer: ReturnType<typeof setInterval> | undefined;

function setMessage(text: string, kind: "ok" | "error" | "" = "") {
  const el = $("message");
  el.textContent = text;
  el.className = "message" + (kind ? " " + kind : "");
}

function renderEvents(list: EventEntry[]) {
  const ul = $("events");
  ul.innerHTML = list.length
    ? list
        .slice(0, 12)
        .map((e) => `<li><time>${esc(fmtDateTime(e.at))}</time><span class="${e.level === "error" ? "err" : e.level === "warn" ? "warn" : e.level === "ok" ? "good" : ""}">${esc(e.text)}</span></li>`)
        .join("")
    : "<li class=\"muted\">Chưa có gì. Bấm Quét ngay hoặc chờ chu kỳ tự động.</li>";
}

function render(s: StatusResponse) {
  $("version").textContent = "v" + s.version;
  for (const [id, path] of [["lnkLeads", "/fb/leads"], ["lnkReplies", "/fb/replies"], ["lnkPosts", "/fb/posts"], ["lnkConnect", "/fb/connect"]] as const) ($(id) as HTMLAnchorElement).href = s.appOrigin + path;

  const status = $("status");
  if (s.connected && s.account) {
    const next = s.nextRunAt && !s.running ? `<br><span class="muted">Tự quét lần tới lúc ${esc(fmtTime(s.nextRunAt))} · đang nhìn webapp ${esc(s.appOrigin.replace(/^https?:\/\//, ""))}</span>` : "";
    const warn = s.account.status !== "ACTIVE" ? `<br><span class="warn">Nick ${ACCOUNT_STATUS[s.account.status]}.</span>` : "";
    status.innerHTML = `<b class="good">Đã kết nối</b> · ${esc(s.user ?? "")}<br>Nick Facebook: <b>${esc(s.account.display_name)}</b>${warn}${next}`;
    $("guide").hidden = true;
  } else {
    status.innerHTML = `<b class="err">Chưa kết nối</b><br>${s.error ? esc(s.error) : "Dán mã kết nối ở Cài đặt để bắt đầu."}`;
    $("guide").hidden = false;
  }

  // Câu trả lời đã duyệt: hai nhóm riêng, đứng tên nick và đứng tên fanpage (v1.1 mục 5.2)
  const rp = s.replyProgress;
  const waiting = s.replies ?? { account: 0, page: 0 };
  $("replyBox").hidden = !s.connected || (!rp && waiting.account + waiting.page === 0);
  const PHASE = { opening: "đang mở bài", filling: "đang tìm comment và điền câu", waiting: "ĐÃ ĐIỀN, chờ bạn đọc và bấm gửi trên tab Facebook" } as const;
  $("replyInfo").textContent = rp
    ? `Đang xử lý câu ${rp.index}/${rp.total} bằng ${rp.group === "page" ? "fanpage" : "nick"}: ${PHASE[rp.phase]}.`
    : "Extension điền sẵn câu vào ô trả lời của đúng comment rồi dừng lại. Bạn đọc lại và tự bấm gửi.";
  const canReply = s.connected && s.account?.status === "ACTIVE" && !s.running;
  ($("replyAccount") as HTMLButtonElement).disabled = !canReply || waiting.account === 0;
  ($("replyAccount") as HTMLButtonElement).textContent = `Trả lời bằng nick (${waiting.account})`;
  ($("replyPage") as HTMLButtonElement).disabled = !canReply || waiting.page === 0;
  ($("replyPage") as HTMLButtonElement).textContent = `Trả lời bằng fanpage (${waiting.page})`;
  $("replyStop").hidden = !rp;

  const act = $("activity");
  const parts: string[] = [];
  if (rp) {
    parts.push(`<b>Đang xử lý trả lời</b> câu ${rp.index}/${rp.total}: <span class="muted">${esc(rp.url)}</span><div class="progress"><span style="width:${Math.round((rp.index / Math.max(1, rp.total)) * 100)}%"></span></div>`);
  } else if (s.running) {
    const p = s.progress;
    parts.push(p ? `<b>Đang quét</b> bài ${p.index}/${p.total}: <span class="muted">${esc(p.url)}</span><div class="progress"><span style="width:${Math.round((p.index / Math.max(1, p.total)) * 100)}%"></span></div>` : "<b>Đang quét...</b> (đang hỏi webapp có bài nào cần quét)");
    parts.push('<span class="muted">Một cửa sổ nhỏ Facebook sẽ tự mở rồi tự đóng; đừng đóng tay.</span>');
  } else if (s.lastCycle) {
    const c = s.lastCycle;
    parts.push(`Lần quét gần nhất ${esc(fmtDateTime(c.at))}: ${c.posts} bài · ${c.newComments} comment mới · <b>${c.newLeads} lead mới</b>`);
    if (c.error) parts.push(`<span class="err">${esc(c.error)}</span>`);
  }
  act.hidden = parts.length === 0;
  act.innerHTML = parts.join("<br>");

  const ok = s.connected && s.account?.status === "ACTIVE";
  ($("runNow") as HTMLButtonElement).disabled = !ok || s.running;
  ($("runNow") as HTMLButtonElement).textContent = rp ? "Đang xử lý trả lời..." : s.running ? "Đang quét..." : "Quét ngay";
  ($("follow") as HTMLButtonElement).disabled = !s.connected;

  if (s.running && !refreshTimer) refreshTimer = setInterval(() => void refresh(), 2000);
  if (!s.running && refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
}

async function refresh() {
  try {
    render(await send<StatusResponse>({ type: "GET_STATUS" }));
    renderEvents(await send<EventEntry[]>({ type: "GET_EVENTS" }));
  } catch (e) {
    $("status").textContent = e instanceof Error ? e.message : String(e);
  }
}

async function activeTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function busy(btn: HTMLButtonElement, on: boolean, label?: string) {
  btn.disabled = on;
  if (label) btn.textContent = on ? "Đang xử lý..." : label;
}

$("runNow").addEventListener("click", async () => {
  setMessage("");
  try {
    const r = await send<{ started: boolean; message: string }>({ type: "RUN_NOW" });
    setMessage(r.message, r.started ? "ok" : "");
    setTimeout(() => void refresh(), 800);
  } catch (e) {
    setMessage(e instanceof Error ? e.message : String(e), "error");
  }
});

for (const [id, group] of [["replyAccount", "account"], ["replyPage", "page"]] as const) {
  $(id).addEventListener("click", async () => {
    setMessage("");
    try {
      const r = await send<{ started: boolean; message: string }>({ type: "START_REPLIES", group });
      setMessage(r.message, r.started ? "ok" : "");
      setTimeout(() => void refresh(), 800);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e), "error");
    }
  });
}

$("replyStop").addEventListener("click", async () => {
  try {
    const r = await send<SimpleResult>({ type: "STOP_REPLIES" });
    setMessage(r.message, "ok");
  } catch (e) {
    setMessage(e instanceof Error ? e.message : String(e), "error");
  }
});

$("follow").addEventListener("click", async () => {
  const btn = $("follow") as HTMLButtonElement;
  setMessage("Đang đọc bài đang mở...");
  busy(btn, true, "Theo dõi bài này");
  try {
    const tabId = await activeTabId();
    if (tabId === null) return setMessage("Không tìm thấy tab đang mở.", "error");
    const r = await send<SimpleResult>({ type: "FOLLOW_ACTIVE_TAB", tabId });
    setMessage(r.message, r.ok ? "ok" : "error");
    void refresh();
  } catch (e) {
    setMessage(e instanceof Error ? e.message : String(e), "error");
  } finally {
    busy(btn, false, "Theo dõi bài này");
  }
});

let lastReport: DiagnosticReport | null = null;

$("diagnose").addEventListener("click", async () => {
  const btn = $("diagnose") as HTMLButtonElement;
  setMessage("Đang đọc cấu trúc trang (khoảng 5 giây)...");
  busy(btn, true, "Chẩn đoán trang này");
  try {
    const tabId = await activeTabId();
    if (tabId === null) return setMessage("Không tìm thấy tab đang mở.", "error");
    const r = await send<{ ok: boolean; message: string; report?: DiagnosticReport }>({ type: "DIAGNOSE_ACTIVE_TAB", tabId });
    setMessage(r.message, r.ok ? "ok" : "error");
    if (r.ok && r.report) {
      lastReport = r.report;
      $("copyReport").hidden = false;
    }
    void refresh();
  } catch (e) {
    setMessage(e instanceof Error ? e.message : String(e), "error");
  } finally {
    busy(btn, false, "Chẩn đoán trang này");
  }
});

$("deepRead").addEventListener("click", async () => {
  const btn = $("deepRead") as HTMLButtonElement;
  setMessage("Đang đọc sâu trang này (có thể mất tới vài phút, đừng đóng tab Facebook). Chỉ đếm, không lưu nội dung...");
  busy(btn, true, "Thử đọc sâu (chỉ đếm)");
  try {
    const tabId = await activeTabId();
    if (tabId === null) return setMessage("Không tìm thấy tab đang mở.", "error");
    const r = await send<{ ok: boolean; message: string; report?: DiagnosticReport }>({ type: "DIAGNOSE_ACTIVE_TAB", tabId, deep: true });
    if (r.ok && r.report) {
      lastReport = r.report;
      $("copyReport").hidden = false;
      const c = r.report.counts;
      const d = r.report.deep;
      setMessage(
        "Kết quả thử đọc sâu (chỉ số đếm):\n" +
          "- Trang báo: " + (r.report.commentCountText ?? (d?.reportedCount != null ? d.reportedCount + " bình luận" : "không rõ")) + "\n" +
          "- Bộ đọc đọc được: " + c.commentsRead + " comment (" + c.repliesRead + " trả lời)\n" +
          "- Có dạng số điện thoại: " + c.commentsWithPhone + "\n" +
          "- Dùng mã thật: " + (c.commentsRead - c.commentsWithFallbackId) + ", mã tạm: " + c.commentsWithFallbackId + "\n" +
          "- Bấm mở rộng " + (d?.steps ?? 0) + " lần trong " + (d?.seconds ?? 0) + " giây, rà ổn định " + (d?.stableRounds ?? 0) + " vòng, " + (d?.complete ? "đã hết nút để bấm" : "dừng vì chạm giới hạn"),
        "ok",
      );
    } else setMessage(r.message, "error");
    void refresh();
  } catch (e) {
    setMessage(e instanceof Error ? e.message : String(e), "error");
  } finally {
    busy(btn, false, "Thử đọc sâu (chỉ đếm)");
  }
});

$("copyReport").addEventListener("click", async () => {
  const report = lastReport ?? (await send<DiagnosticReport | null>({ type: "GET_LAST_DIAGNOSTIC" }));
  if (!report) return setMessage("Chưa có báo cáo nào. Bấm Chẩn đoán trang này trước.", "error");
  try {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setMessage("Đã sao chép báo cáo. Dán vào tin nhắn gửi người phát triển (báo cáo không chứa tên hay nội dung comment).", "ok");
  } catch {
    setMessage("Không sao chép được. Mở Cài đặt & hướng dẫn, phần Chẩn đoán có ô để sao chép tay.", "error");
  }
});

$("settings").addEventListener("click", () => void chrome.runtime.openOptionsPage());

void send<DiagnosticReport | null>({ type: "GET_LAST_DIAGNOSTIC" })
  .then((r) => {
    if (r) $("copyReport").hidden = false;
  })
  .catch(() => undefined);
void refresh();
