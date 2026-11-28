// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.facebook.com/groups/123456789/posts/987654321012/"}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearReplyText, clickRefusal, editableText, highlightBox, insertReplyText, safeClick } from "./fill";

/**
 * Trang HTML MÔ PHỎNG (giả định của người viết, không phải Facebook thật): một bình luận có hàng nút Thích / Phản hồi, và một
 * form soạn trả lời có ô nhập, nút chọn danh tính và nút gửi.
 */
const FIXTURE = `
<div role="article" aria-label="Bình luận của Xưởng May A" id="comment">
  <div dir="auto">Xưởng em nhận may áo polo, LH 0912345678</div>
  <div role="button" id="like">Thích</div>
  <div role="button" id="reply">Phản hồi</div>
</div>
<form id="composer">
  <div role="button" id="who" aria-haspopup="menu" aria-label="Bình luận với tư cách Lan"><img alt="Lan" /></div>
  <div role="textbox" contenteditable="true" id="box" aria-label="Phản hồi dưới tên Lan"></div>
  <div role="button" id="replyInForm">Phản hồi</div>
  <div role="button" id="send" aria-label="Bình luận"></div>
  <button type="submit" id="submit">Gửi</button>
</form>
<div role="menu" id="menu"><div role="menuitemradio" id="opt">Vật Liệu Logo ABC</div><div role="menuitem" id="optSend">Đăng</div></div>
<div role="button" id="outside">Vật Liệu Logo ABC</div>`;

const $ = (id: string) => document.getElementById(id) as HTMLElement;

/** Giả lệnh chèn / xoá chữ của trình duyệt: ghi vào phần tử đang chứa con trỏ. jsdom không có lệnh này. */
function stubExecCommand(works = true) {
  const fn = vi.fn((cmd: string, _ui?: boolean, value?: string) => {
    if (!works) return false;
    const node = window.getSelection()?.anchorNode;
    const el = (node instanceof HTMLElement ? node : node?.parentElement) ?? null;
    if (!el) return false;
    if (cmd === "insertText") el.append(value ?? "");
    if (cmd === "delete") el.replaceChildren();
    return true;
  });
  (document as unknown as { execCommand: unknown }).execCommand = fn;
  return fn;
}

beforeEach(() => {
  document.body.innerHTML = FIXTURE;
  Element.prototype.getBoundingClientRect = () => ({ width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  Element.prototype.scrollIntoView = () => undefined;
});

describe("safeClick: không bao giờ bấm nút gửi", () => {
  it("từ chối mọi nút có nhãn gửi / đăng / bình luận, với mọi mục đích", () => {
    for (const label of ["Gửi", "Đăng", "Bình luận", "Send", "Post", "Comment", "Chia sẻ", "Lưu", "Cập nhật"]) {
      const el = document.createElement("div");
      el.setAttribute("role", "button");
      el.setAttribute("aria-haspopup", "menu");
      el.append(label);
      $("menu").append(el);
      const clicked = vi.fn();
      el.addEventListener("click", clicked);
      for (const purpose of ["reply_action", "identity_switcher", "identity_option"] as const) expect(safeClick(el, purpose), `${label} / ${purpose}`).toBe(false);
      expect(clicked).not.toHaveBeenCalled();
    }
  });

  it("từ chối nút gửi nhận theo aria-label, nút submit, và chính ô nhập", () => {
    expect(clickRefusal($("send"), "identity_switcher")).toMatch(/gửi/);
    expect(clickRefusal($("submit"), "reply_action")).toMatch(/submit/);
    expect(clickRefusal($("box"), "identity_switcher")).toMatch(/ô nhập/);
    const clicked = vi.fn();
    for (const id of ["send", "submit", "box"]) $(id).addEventListener("click", clicked);
    for (const id of ["send", "submit", "box"]) for (const purpose of ["reply_action", "identity_switcher", "identity_option"] as const) safeClick($(id), purpose);
    expect(clicked).not.toHaveBeenCalled();
  });

  it("nút Phản hồi dưới bình luận thì bấm; nút cùng nhãn nằm trong form soạn thảo thì không", () => {
    const clicked = vi.fn();
    $("reply").addEventListener("click", clicked);
    $("replyInForm").addEventListener("click", clicked);
    expect(safeClick($("reply"), "reply_action")).toBe(true);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(safeClick($("replyInForm"), "reply_action")).toBe(false);
    expect(safeClick($("like"), "reply_action")).toBe(false); // nhãn khác
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("nút chuyển danh tính phải là nút mở danh sách hoặc mang nhãn danh tính; mục danh tính phải nằm trong danh sách đang mở", () => {
    expect(clickRefusal($("who"), "identity_switcher")).toBeNull();
    expect(clickRefusal($("like"), "identity_switcher")).not.toBeNull();
    expect(clickRefusal($("opt"), "identity_option")).toBeNull();
    expect(clickRefusal($("outside"), "identity_option")).not.toBeNull(); // cùng tên nhưng nằm ngoài danh sách
    expect(clickRefusal($("optSend"), "identity_option")).not.toBeNull(); // mục có nhãn "Đăng" trong danh sách
  });
});

describe("insertReplyText: điền câu vào ô trả lời rồi dừng", () => {
  const TEXT = "Dạ chào anh, bên em là Vật Liệu Logo ABC chuyên cung cấp vật liệu làm logo.\nAnh nhắn page giúp em nhé.";
  const ONE_LINE = "Dạ chào anh, bên em là Vật Liệu Logo ABC chuyên cung cấp vật liệu làm logo. Anh nhắn page giúp em nhé.";

  it("chèn đúng câu, ép thành một dòng (không có ký tự xuống dòng nào)", async () => {
    const exec = stubExecCommand();
    expect(await insertReplyText($("box"), TEXT)).toBe(true);
    expect(editableText($("box"))).toBe(ONE_LINE);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec.mock.calls[0][0]).toBe("insertText");
    expect(String(exec.mock.calls[0][2])).not.toMatch(/[\r\n]/);
  });

  it("không bấm nút nào và không gửi form khi điền", async () => {
    stubExecCommand();
    const clicked = vi.fn();
    const submitted = vi.fn();
    for (const el of document.querySelectorAll("[role=button], button")) el.addEventListener("click", clicked);
    $("composer").addEventListener("submit", submitted);
    await insertReplyText($("box"), TEXT);
    expect(clicked).not.toHaveBeenCalled();
    expect(submitted).not.toHaveBeenCalled();
  });

  it("ô đã có đúng câu này thì không chèn lần hai", async () => {
    const exec = stubExecCommand();
    await insertReplyText($("box"), TEXT);
    expect(await insertReplyText($("box"), TEXT)).toBe(true);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(editableText($("box"))).toBe(ONE_LINE);
  });

  it("ô có sẵn tên người được trả lời thì giữ lại và chèn tiếp phía sau", async () => {
    stubExecCommand();
    $("box").append("Xưởng May A");
    expect(await insertReplyText($("box"), "Dạ bên em chào anh ạ")).toBe(true);
    expect(editableText($("box"))).toBe("Xưởng May A Dạ bên em chào anh ạ");
  });

  it("trình soạn thảo không nhận chữ thì báo thất bại, không báo bừa là đã điền", async () => {
    stubExecCommand(false);
    expect(await insertReplyText($("box"), TEXT)).toBe(false);
    expect(editableText($("box"))).toBe("");
  });

  it("câu rỗng thì không làm gì", async () => {
    const exec = stubExecCommand();
    expect(await insertReplyText($("box"), "  \n ")).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("clearReplyText và highlightBox", () => {
  it("bỏ qua một câu: xoá chữ extension đã điền", async () => {
    stubExecCommand();
    await insertReplyText($("box"), "Dạ bên em chào anh ạ");
    clearReplyText($("box"), "Dạ bên em chào anh ạ");
    expect(editableText($("box"))).toBe("");
  });

  it("người đã sửa câu khác đi thì không xoá", async () => {
    const exec = stubExecCommand();
    $("box").append("Câu người dùng tự viết");
    clearReplyText($("box"), "Dạ bên em chào anh ạ");
    expect(editableText($("box"))).toBe("Câu người dùng tự viết");
    expect(exec).not.toHaveBeenCalled();
  });

  it("tô viền ô trả lời để người dùng thấy chỗ cần đọc và bấm gửi, rồi bỏ viền", () => {
    highlightBox($("box"), true);
    expect($("box").style.outline).not.toBe("");
    highlightBox($("box"), false);
    expect($("box").style.outline).toBe("");
  });
});
