/**
 * Bảng nhỏ của extension hiện ở góc trang Facebook trong lúc xử lý câu trả lời: cho biết đang ở câu nào, nhắc người dùng đọc
 * và tự bấm gửi, và có hai nút "Bỏ qua câu này", "Dừng". Popup của extension tự đóng khi người dùng bấm vào trang, nên các nút
 * này phải nằm ngay trên trang.
 *
 * Bảng nằm trong shadow root riêng gắn vào <html>: đây là giao diện CỦA EXTENSION, không ghi gì vào nội dung hay ô nhập của
 * Facebook, và không chứa tên người hay nội dung comment.
 */
type Tone = "info" | "ok" | "warn";
export type PanelAction = "skip" | "stop";

const HOST_ID = "data-lead-reply-panel";
const TONES: Record<Tone, string> = { info: "#2563eb", ok: "#059669", warn: "#d97706" };

let onAction: ((a: PanelAction) => void) | null = null;

function button(label: string, action: PanelAction, primary: boolean): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.append(label);
  b.setAttribute("style", `all:unset;cursor:pointer;padding:6px 10px;border-radius:8px;font:600 12px system-ui,sans-serif;${primary ? "background:#111;color:#fff" : "border:1px solid #d4d4d8;color:#111;background:#fff"}`);
  b.addEventListener("click", () => onAction?.(action));
  return b;
}

/** Hiện (hoặc cập nhật) bảng. `buttons` = có hiện hai nút Bỏ qua / Dừng không (chỉ hiện khi đang chờ người bấm gửi). */
export function showPanel(text: string, tone: Tone, buttons: boolean, handler: ((a: PanelAction) => void) | null): void {
  onAction = handler;
  document.getElementById(HOST_ID)?.remove();
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("style", "all:initial;position:fixed;top:72px;right:16px;z-index:2147483647");
  const root = host.attachShadow({ mode: "closed" });

  const card = document.createElement("div");
  card.setAttribute("style", `width:300px;padding:12px 14px;border-radius:12px;background:#fff;color:#111;box-shadow:0 8px 30px rgba(0,0,0,.25);border-left:5px solid ${TONES[tone]};font:13px/1.45 system-ui,sans-serif`);
  const title = document.createElement("div");
  title.setAttribute("style", "font-weight:700;margin-bottom:4px");
  title.append("Data Lead Facebook");
  const body = document.createElement("div");
  body.setAttribute("style", "white-space:pre-wrap");
  body.append(text);
  card.append(title, body);

  if (buttons) {
    const row = document.createElement("div");
    row.setAttribute("style", "display:flex;gap:8px;margin-top:10px");
    row.append(button("Bỏ qua câu này", "skip", false), button("Dừng", "stop", false));
    card.append(row);
  }
  root.append(card);
  document.documentElement.append(host);
}

export function hidePanel(): void {
  onAction = null;
  document.getElementById(HOST_ID)?.remove();
}
