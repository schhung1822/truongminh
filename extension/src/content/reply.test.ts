// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.facebook.com/groups/123456789/posts/987654321012/"}
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentMessage } from "../types";
import { findCommentArticle } from "./extract";
import { editableText } from "./fill";
import { cancelReply, fillReply, findReplyAction, showReplyPanel, waitForSent } from "./reply";
import { diagnoseReply } from "./reply-diagnose";

/**
 * Luồng trả lời trên một trang HTML MÔ PHỎNG (giả định của người viết, không phải Facebook thật): bấm "Phản hồi" dưới một bình
 * luận thì hiện form trả lời ngay dưới bình luận đó; form có nút chọn danh tính, ô nhập và nút gửi. Test chứng minh trình tự:
 * tìm đúng comment -> mở ô trả lời -> chọn đúng danh tính -> điền -> DỪNG, và extension không bao giờ bấm nút gửi.
 */
const NICK = "Lan Trường Minh";
const PAGE = "Vật Liệu Logo ABC";
const POST = "https://www.facebook.com/groups/123456789/posts/987654321012/";

const comment = (id: string, author: string, text: string, extra = "") => `
  <div role="article" aria-label="Bình luận của ${author}" data-cid="${id}">
    <a role="link" href="https://www.facebook.com/groups/123456789/user/${id}000/?comment_id=${id}"><span>${author}</span></a>
    <div dir="auto">${text}</div>
    <div role="button">Thích</div><div role="button" class="reply-action">Phản hồi</div>
    <a href="${POST}?comment_id=${id}">2 giờ</a>
    ${extra}
  </div>`;

const FIXTURE = `
<div role="article" aria-label="Bài viết của ${NICK}" id="post">
  <h3><a href="https://www.facebook.com/groups/123456789/user/100012345678/"><span>${NICK}</span></a></h3>
  <div data-ad-comet-preview="message"><div dir="auto">Cần tìm xưởng may áo polo mẫu P01</div></div>
  <span>3 bình luận</span>
  ${comment("501", "Xưởng May A", "Xưởng em nhận may áo polo, LH 0912345678")}
  ${comment("502", "Xưởng May B", "Bên mình có xưởng 50 máy, ib nhé")}
  <div role="button" id="more">Xem thêm 1 bình luận</div>
</div>`;

type PageOpts = { pageInList?: boolean; switcher?: boolean };
let sendClicks = 0;
let currentIdentity = NICK;

/** Gắn hành vi cho trang mô phỏng: nút Phản hồi mở form, nút danh tính mở menu, "Xem thêm bình luận" nạp thêm một comment. */
function wire(o: PageOpts = {}) {
  const { pageInList = true, switcher = true } = o;
  sendClicks = 0;
  currentIdentity = NICK;
  document.body.innerHTML = FIXTURE;
  const post = document.getElementById("post")!;

  const wireReply = (article: Element) => {
    article.querySelector(".reply-action")!.addEventListener("click", () => {
      if (article.nextElementSibling?.matches("form")) return;
      const form = document.createElement("form");
      const box = document.createElement("div");
      box.setAttribute("role", "textbox");
      box.setAttribute("contenteditable", "true");
      box.setAttribute("aria-label", `Phản hồi dưới tên ${currentIdentity}`);
      if (switcher) {
        const who = document.createElement("div");
        who.setAttribute("role", "button");
        who.setAttribute("aria-haspopup", "menu");
        who.setAttribute("aria-label", "Chọn danh tính bình luận");
        who.addEventListener("click", () => {
          const open = document.getElementById("menu");
          if (open) return open.remove();
          const menu = document.createElement("div");
          menu.id = "menu";
          menu.setAttribute("role", "menu");
          for (const name of pageInList ? [NICK, PAGE] : [NICK]) {
            const item = document.createElement("div");
            item.setAttribute("role", "menuitemradio");
            item.setAttribute("aria-checked", String(name === currentIdentity));
            item.append(name);
            item.addEventListener("click", () => {
              currentIdentity = name;
              box.setAttribute("aria-label", `Phản hồi dưới tên ${name}`);
              menu.remove();
            });
            menu.append(item);
          }
          document.body.append(menu);
        });
        form.append(who);
      }
      const send = document.createElement("div");
      send.setAttribute("role", "button");
      send.setAttribute("aria-label", "Bình luận");
      send.addEventListener("click", () => sendClicks++);
      form.addEventListener("submit", () => sendClicks++);
      form.append(box, send);
      article.after(form);
    });
  };
  for (const a of post.querySelectorAll('[role="article"]')) wireReply(a);
  document.getElementById("more")!.addEventListener("click", (e) => {
    const holder = document.createElement("div");
    holder.innerHTML = comment("503", "Xưởng May C", "Xưởng C nhận đơn từ 200 cái");
    const article = holder.firstElementChild!;
    (e.currentTarget as Element).replaceWith(article);
    wireReply(article);
  });
}

/** Người dùng tự bấm gửi: câu trả lời xuất hiện dưới bình luận, dưới tên danh tính đang chọn. */
function humanSends(parentId: string, replyId: string) {
  const parent = document.querySelector(`[data-cid="${parentId}"]`)!;
  const text = editableText(parent.nextElementSibling!.querySelector('[role="textbox"]') as HTMLElement);
  const holder = document.createElement("div");
  holder.innerHTML = `
    <div role="article" aria-label="Phản hồi của ${currentIdentity}">
      <a role="link" href="https://www.facebook.com/groups/123456789/user/${currentIdentity === NICK ? "100012345678" : "61500000001"}/"><span>${currentIdentity}</span></a>
      <div dir="auto">${text}</div>
      <a href="${POST}?comment_id=${parentId}&amp;reply_comment_id=${replyId}">Vừa xong</a>
    </div>`;
  parent.append(holder.firstElementChild!);
  parent.nextElementSibling!.remove();
}

const OWN = { ownProfileUrl: "https://www.facebook.com/lan.truongminh", ownDisplayName: NICK };
const fillMsg = (over: Partial<Extract<ContentMessage, { type: "REPLY_FILL" }>> = {}): Extract<ContentMessage, { type: "REPLY_FILL" }> => ({
  type: "REPLY_FILL",
  fbCommentId: "501",
  parentFbCommentId: null,
  text: "Dạ chào anh, bên em là Vật Liệu Logo ABC chuyên cung cấp vật liệu làm logo, mẫu này hợp với Vân xoắn bạc xám. Anh nhắn page giúp em nhé.",
  replyAs: "page",
  pageName: PAGE,
  pageNames: [PAGE],
  ...OWN,
  ...over,
});

const boxOf = (id: string) => (document.querySelector(`[data-cid="${id}"]`)!.nextElementSibling?.querySelector<HTMLElement>('[role="textbox"]') ?? undefined) as HTMLElement | undefined;

beforeEach(() => {
  Element.prototype.getBoundingClientRect = () => ({ width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  Element.prototype.scrollIntoView = () => undefined;
  window.scrollTo = () => undefined;
  (document as unknown as { execCommand: unknown }).execCommand = (cmd: string, _ui?: boolean, value?: string) => {
    const node = window.getSelection()?.anchorNode;
    const el = (node instanceof HTMLElement ? node : node?.parentElement) ?? null;
    if (!el) return false;
    if (cmd === "insertText") el.append(value ?? "");
    if (cmd === "delete") el.replaceChildren();
    return true;
  };
  cancelReply(false);
  document.getElementById("data-lead-reply-panel")?.remove();
});

describe("fillReply: trả lời dưới tên fanpage", () => {
  it("tìm đúng comment, mở ô trả lời của nó, chuyển sang fanpage, điền câu rồi dừng; không bấm gửi", async () => {
    wire();
    const msg = fillMsg();
    expect(await fillReply(msg)).toEqual({ state: "filled" });
    const box = boxOf("501")!;
    expect(box.getAttribute("aria-label")).toBe(`Phản hồi dưới tên ${PAGE}`);
    expect(editableText(box)).toBe(msg.text);
    expect(box.style.outline).not.toBe(""); // tô viền để người dùng thấy
    expect(boxOf("502")).toBeUndefined(); // không mở ô của comment khác
    expect(sendClicks).toBe(0);
    // chưa ai bấm gửi: chỉ chờ
    expect(await waitForSent(1_000)).toEqual({ state: "waiting" });
    expect(sendClicks).toBe(0);
  }, 30_000);

  it("người dùng tự bấm gửi thì extension thấy câu trả lời mới của fanpage và báo sent", async () => {
    wire();
    await fillReply(fillMsg());
    setTimeout(() => humanSends("501", "9001"), 1_200);
    expect(await waitForSent(8_000)).toEqual({ state: "sent" });
    expect(sendClicks).toBe(0); // "gửi" ở đây là người gửi, không phải extension
  }, 30_000);

  it("fanpage không có trong danh sách chuyển danh tính: page_not_available và KHÔNG điền gì", async () => {
    wire({ pageInList: false });
    expect(await fillReply(fillMsg())).toMatchObject({ state: "failed", reason: "page_not_available", item: "identity_switcher" });
    expect(editableText(boxOf("501")!)).toBe("");
    expect(sendClicks).toBe(0);
    expect(await waitForSent(500)).toEqual({ state: "lost" }); // không có câu nào đang chờ gửi
  }, 30_000);

  it("không có nút chuyển danh tính: page_not_available và không điền", async () => {
    wire({ switcher: false });
    expect(await fillReply(fillMsg())).toMatchObject({ state: "failed", reason: "page_not_available" });
    expect(editableText(boxOf("501")!)).toBe("");
  }, 30_000);

  it("comment đã có trả lời của fanpage thì không điền câu thứ hai", async () => {
    wire();
    await fillReply(fillMsg());
    humanSends("501", "9001");
    cancelReply(false);
    expect(await fillReply(fillMsg())).toEqual({ state: "already_replied" });
    expect(sendClicks).toBe(0);
  }, 40_000);
});

describe("fillReply: trả lời bằng nick, và xử lý lần lượt trong cùng một bài", () => {
  it("điền bằng nick, không đụng tới nút chuyển danh tính khi đang đúng là nick", async () => {
    wire();
    const msg = fillMsg({ replyAs: "account", pageName: null, text: "Dạ em chào anh, anh nhắn page giúp em nhé." });
    expect(await fillReply(msg)).toEqual({ state: "filled" });
    expect(boxOf("501")!.getAttribute("aria-label")).toBe(`Phản hồi dưới tên ${NICK}`);
    expect(editableText(boxOf("501")!)).toBe(msg.text);
    expect(sendClicks).toBe(0);
  }, 30_000);

  it("hai comment của cùng một bài: xong câu đầu rồi sang câu sau trong cùng trang; comment chưa hiện thì bấm 'Xem thêm bình luận' để tìm", async () => {
    wire();
    await fillReply(fillMsg({ fbCommentId: "502" }));
    humanSends("502", "9002");
    expect(await waitForSent(3_000)).toEqual({ state: "sent" });
    cancelReply(false);

    expect(document.querySelector('[data-cid="503"]')).toBeNull();
    expect(await fillReply(fillMsg({ fbCommentId: "503" }))).toEqual({ state: "filled" });
    expect(editableText(boxOf("503")!)).toContain("Vật Liệu Logo ABC");
    expect(sendClicks).toBe(0);
  }, 60_000);

  it("bỏ qua một câu trên bảng nhỏ: báo skipped và xoá chữ đã điền", async () => {
    wire();
    // bảng nằm trong shadow root đóng; giữ lại root để test bấm được nút
    const roots: ShadowRoot[] = [];
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init: ShadowRootInit) {
      const root = attach.call(this, init);
      roots.push(root);
      return root;
    };
    try {
      await fillReply(fillMsg());
      showReplyPanel("Câu 1/1 đã điền. Hãy đọc lại rồi tự bấm gửi.", "warn", true);
      const skip = [...roots.at(-1)!.querySelectorAll("button")].find((b) => b.textContent === "Bỏ qua câu này")!;
      skip.click();
      expect(await waitForSent(3_000)).toEqual({ state: "skipped" });
      cancelReply(true);
      expect(editableText(boxOf("501")!)).toBe("");
      expect(sendClicks).toBe(0);
    } finally {
      Element.prototype.attachShadow = attach;
    }
  }, 30_000);
});

describe("tìm comment và chẩn đoán", () => {
  it("findReplyAction chỉ lấy nút Phản hồi của chính bình luận đó", () => {
    wire();
    const a = document.querySelector('[data-cid="501"]') as HTMLElement;
    expect(findReplyAction(a)?.className).toBe("reply-action");
    expect(findReplyAction(document.getElementById("post") as HTMLElement)).toBeNull();
  });

  it("findCommentArticle: không thấy trong giới hạn thì trả null, không đoán comment khác", async () => {
    wire();
    const own = { profileUrl: OWN.ownProfileUrl, displayName: NICK };
    expect(await findCommentArticle("999", own, { maxSteps: 0, maxMs: 0 })).toBeNull();
    expect((await findCommentArticle("502", own))?.getAttribute("data-cid")).toBe("502");
  });

  it("báo cáo chẩn đoán của luồng trả lời không chứa tên người: tên nick, tên fanpage và tên khác đều được che", async () => {
    wire();
    await fillReply(fillMsg());
    const report = diagnoseReply({ nick: NICK, pages: [PAGE] });
    expect(report.replyActions).toBe(2);
    expect(report.textboxes).toBe(1);
    expect(report.textboxLabels).toEqual(["Phản hồi dưới tên {page}"]);
    expect(report.identityByLabel).toHaveLength(1);
    const dump = JSON.stringify(report);
    for (const name of [NICK, PAGE, "Xưởng May A", "0912345678"]) expect(dump).not.toContain(name);
  }, 30_000);
});

describe("không có đường nào để extension tự gửi", () => {
  it("các hàm của luồng trả lời không bao giờ làm nút gửi hay form nhận sự kiện", async () => {
    wire();
    const submit = vi.fn();
    document.addEventListener("submit", submit, true);
    await fillReply(fillMsg());
    await waitForSent(1_000);
    cancelReply(true);
    await fillReply(fillMsg({ fbCommentId: "502", replyAs: "account", pageName: null }));
    cancelReply(false);
    expect(sendClicks).toBe(0);
    expect(submit).not.toHaveBeenCalled();
    document.removeEventListener("submit", submit, true);
  }, 60_000);
});
