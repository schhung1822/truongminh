/**
 * NƠI DUY NHẤT của extension được ghi vào ô nhập của Facebook và được bấm nút trong luồng trả lời (v1.0 mục 8.3, v1.1 mục 5.1).
 *
 * Việc được làm:
 * - Bấm nút "Phản hồi" dưới một bình luận để MỞ ô trả lời, bấm nút mở danh sách danh tính và chọn một danh tính trong đó.
 *   Mọi lần bấm đều đi qua `safeClick`, hàm này từ chối nút gửi / đăng theo nhãn, theo kiểu submit, và theo vị trí.
 * - Đặt con trỏ vào ô trả lời và chèn câu đã được người duyệt trên webapp, rồi tô viền ô đó.
 *
 * Việc KHÔNG BAO GIỜ làm, có test chặn (guard.test.ts): giả lập bàn phím (không có phím Enter nào), gửi form, bấm nút gửi.
 * Sau khi điền, extension dừng; người đọc lại, sửa nếu cần và tự bấm gửi.
 */
import { sleep } from "./extract";
import { isSendLabel, replyLabelMatches } from "./selectors";

/** Ô soạn bình luận / trả lời của Facebook. */
export const EDITABLE = '[role="textbox"][contenteditable="true"], div[contenteditable="true"][data-lexical-editor="true"], textarea';

const isVisible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

export const labelOf = (el: Element) => ((el as HTMLElement).innerText ?? el.textContent ?? "").trim() || el.getAttribute("aria-label") || "";

export type ClickPurpose = "reply_action" | "identity_switcher" | "identity_option";

/** Vì sao phần tử này không được bấm; null = được bấm. Tách riêng để kiểm thử. */
export function clickRefusal(el: Element, purpose: ClickPurpose): string | null {
  const label = labelOf(el);
  if (el.closest('[type="submit"]') || el.querySelector('[type="submit"]')) return "là nút submit";
  if (isSendLabel(label) || isSendLabel(el.getAttribute("aria-label") ?? "")) return "nhãn là nút gửi / đăng";
  if (el.matches(EDITABLE) || el.closest(EDITABLE)) return "là ô nhập";

  switch (purpose) {
    case "reply_action":
      // Nút "Phản hồi" nằm ở hàng thao tác dưới bình luận. Nút nào nằm trong form soạn thảo thì có thể là nút gửi: không bấm.
      if (!replyLabelMatches(label, "replyAction")) return "nhãn không phải Phản hồi";
      if (el.closest("form")) return "nằm trong form soạn thảo";
      return null;
    case "identity_switcher":
      // Phải là nút mở một danh sách (aria-haspopup) hoặc mang nhãn của bộ chọn danh tính
      if (!el.hasAttribute("aria-haspopup") && !replyLabelMatches(label, "identitySwitcher") && !replyLabelMatches(el.getAttribute("aria-label") ?? "", "identitySwitcher")) return "không phải nút mở danh sách danh tính";
      return null;
    case "identity_option":
      // Chỉ bấm một mục nằm trong danh sách đang mở
      if (!el.closest('[role="menu"], [role="listbox"], [role="dialog"], [role="radiogroup"]')) return "không nằm trong danh sách danh tính";
      return null;
  }
}

/** Bấm một phần tử của luồng trả lời nếu nó không phải nút gửi. Trả false (và không bấm) khi bị từ chối. */
export function safeClick(el: HTMLElement, purpose: ClickPurpose): boolean {
  if (clickRefusal(el, purpose) !== null) return false;
  el.click();
  return true;
}

/** Chữ đang có trong ô nhập, gộp khoảng trắng (Lexical chèn ký tự không ngắt và thẻ <br>). */
export function editableText(box: HTMLElement): string {
  const raw = box instanceof HTMLTextAreaElement ? box.value : (box.innerText ?? box.textContent ?? "");
  return raw.replace(/[ ​﻿]/g, " ").replace(/\s+/g, " ").trim();
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

function caretToEnd(box: HTMLElement): void {
  box.focus();
  if (box instanceof HTMLTextAreaElement) {
    box.setSelectionRange(box.value.length, box.value.length);
    return;
  }
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(box);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

async function waitText(box: HTMLElement, wanted: string, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (editableText(box).includes(wanted)) return true;
    if (Date.now() >= end) return false;
    await sleep(100);
  }
}

/**
 * Chèn câu trả lời vào ô nhập. Câu luôn được ép thành MỘT dòng (không có ký tự xuống dòng nào để trình soạn thảo hiểu thành
 * phím Enter). Thử hai cách, mỗi cách chờ xem chữ có thật sự xuất hiện trong ô không rồi mới thử cách sau, để không chèn hai lần:
 * 1. Lệnh chèn chữ của trình duyệt tại vị trí con trỏ (trình soạn thảo của Facebook nhận như chữ được dán vào).
 * 2. Sự kiện dán (paste) mang chữ thuần.
 * Trả true khi ô nhập chứa đúng câu cần điền.
 */
export async function insertReplyText(box: HTMLElement, text: string): Promise<boolean> {
  const wanted = oneLine(text);
  if (!wanted) return false;
  if (editableText(box).includes(wanted)) return true; // đã điền từ lần trước (thử lại)

  const lead = editableText(box) !== "" ? " " : ""; // ô có sẵn chữ (Facebook tự gắn tên người được trả lời): cách ra một khoảng
  caretToEnd(box);
  try {
    document.execCommand("insertText", false, lead + wanted);
  } catch {
    /* trình duyệt không hỗ trợ: thử cách 2 */
  }
  if (await waitText(box, wanted, 1_200)) return true;

  if (typeof DataTransfer === "function" && typeof ClipboardEvent === "function") {
    caretToEnd(box);
    const data = new DataTransfer();
    data.setData("text/plain", lead + wanted);
    box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    if (await waitText(box, wanted, 1_200)) return true;
  }
  return false;
}

/** Xoá chữ extension đã điền khi người dùng bấm "Bỏ qua câu này" (chỉ khi ô còn đúng câu đó, không đụng chữ người đã sửa). */
export function clearReplyText(box: HTMLElement, text: string): void {
  if (!box.isConnected || !editableText(box).includes(oneLine(text))) return;
  box.focus();
  if (box instanceof HTMLTextAreaElement) {
    box.select();
  } else {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(box);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  try {
    document.execCommand("delete");
  } catch {
    /* không xoá được thì để nguyên; bảng nhỏ đã nhắc người dùng */
  }
}

const HIGHLIGHT = "3px solid #f59e0b";

/** Tô viền ô trả lời để người dùng thấy ngay chỗ cần đọc và bấm gửi (v1.0 mục 8.3 bước 4). */
export function highlightBox(box: HTMLElement, on: boolean): void {
  if (!box.isConnected) return;
  box.style.outline = on ? HIGHLIGHT : "";
  box.style.outlineOffset = on ? "2px" : "";
  if (on) box.scrollIntoView({ block: "center" });
}

/** Các ô nhập đang hiện trên trang. */
export function visibleEditables(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(EDITABLE)].filter(isVisible);
}
