// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.facebook.com/groups/123456789/posts/987654321012/"}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentIdentity, ensureIdentity, findIdentitySwitcher } from "./identity";

/**
 * Trang HTML MÔ PHỎNG nút chuyển danh tính bình luận. Đây là GIẢ ĐỊNH của người viết về cách Facebook dựng nút này (nút mở một
 * menu, mỗi danh tính là một mục, ô trả lời ghi tên danh tính đang dùng trong aria-label), CHƯA đối chiếu với trang thật.
 * Test chỉ chứng minh: khi cấu trúc đúng như giả định thì chọn được fanpage, và khi không xác nhận được thì không điền.
 */
const NICK = "Lan Trường Minh";
const PAGE = "Vật Liệu Logo ABC";
const OTHER_PAGE = "Xưởng In XYZ";

type Opts = {
  /** Danh tính đang chọn lúc đầu */
  current?: string;
  /** Các danh tính có trong danh sách */
  options?: string[];
  /** Nút chuyển có nhãn danh tính không (false = chỉ nhận được theo cấu trúc: nút mở menu có ảnh đại diện) */
  labelled?: boolean;
  /** Có nút chuyển danh tính không */
  switcher?: boolean;
  /** Chọn xong thì trang có ghi tên danh tính mới lên ô trả lời / nút không (false = Facebook không phản ánh gì) */
  reflect?: boolean;
  /** Chọn xong thì mục có được đánh dấu aria-checked không */
  check?: boolean;
};

/** Dựng form trả lời có hành vi: bấm nút chuyển thì mở / đóng menu, bấm một mục thì đổi danh tính. */
function build(o: Opts = {}) {
  const { options = [NICK, PAGE], labelled = true, switcher = true, reflect = true, check = true } = o;
  let current = o.current ?? NICK;
  const clicks: string[] = [];
  document.body.innerHTML = `
    <div role="article" aria-label="Bình luận của Xưởng May A"><div dir="auto">Xưởng em nhận may áo polo</div><div role="button">Phản hồi</div></div>
    <form id="composer">
      <div role="textbox" contenteditable="true" id="box"></div>
      <div role="button" id="send" aria-label="Bình luận"></div>
    </form>`;
  const box = document.getElementById("box") as HTMLElement;
  const form = document.getElementById("composer") as HTMLElement;
  const send = document.getElementById("send") as HTMLElement;
  send.addEventListener("click", () => clicks.push("SEND"));
  const paint = () => {
    if (reflect || current === (o.current ?? NICK)) box.setAttribute("aria-label", `Phản hồi dưới tên ${current}`);
  };
  paint();

  if (switcher) {
    const who = document.createElement("div");
    who.id = "who";
    who.setAttribute("role", "button");
    who.setAttribute("aria-haspopup", "menu");
    if (labelled) who.setAttribute("aria-label", "Chọn danh tính bình luận");
    who.append(document.createElement("img"));
    form.prepend(who);
    who.addEventListener("click", () => {
      clicks.push("switcher");
      const open = document.getElementById("menu");
      if (open) return open.remove();
      const menu = document.createElement("div");
      menu.id = "menu";
      menu.setAttribute("role", "menu");
      for (const name of options) {
        const item = document.createElement("div");
        item.setAttribute("role", "menuitemradio");
        item.setAttribute("aria-checked", String(check && name === current));
        item.append(name);
        item.addEventListener("click", () => {
          clicks.push(`option:${name}`);
          current = name;
          paint();
          menu.remove();
        });
        menu.append(item);
      }
      document.body.append(menu);
    });
  }
  return { box, clicks, get current() { return current; } };
}

const run = (box: HTMLElement, target: string, kind: "page" | "account", others: string[]) => ensureIdentity({ box, target, kind, others, reacquireBox: async () => document.getElementById("box") });

beforeEach(() => {
  Element.prototype.getBoundingClientRect = () => ({ width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  Element.prototype.scrollIntoView = () => undefined;
});

describe("findIdentitySwitcher và currentIdentity", () => {
  it("cách 1: nút mở danh sách có nhãn danh tính", () => {
    const { box } = build();
    expect(findIdentitySwitcher(box)).toMatchObject({ via: "label_haspopup" });
  });
  it("cách 3: không có nhãn thì nhận theo cấu trúc (nút mở danh sách có ảnh đại diện, nằm trong vùng soạn thảo)", () => {
    const { box } = build({ labelled: false });
    expect(findIdentitySwitcher(box)).toMatchObject({ via: "structure" });
  });
  it("không có nút nào thì null; nút gửi không bao giờ bị coi là nút chuyển danh tính", () => {
    const { box } = build({ switcher: false });
    expect(findIdentitySwitcher(box)).toBeNull();
  });
  it("đọc danh tính đang dùng từ nhãn ô trả lời, so nguyên tên (tên dài trước)", () => {
    const { box } = build({ current: "Vật Liệu Logo ABC Hà Nội", options: [] });
    expect(currentIdentity(box, null, [PAGE, "Vật Liệu Logo ABC Hà Nội", NICK])).toBe("Vật Liệu Logo ABC Hà Nội");
    expect(currentIdentity(box, null, [NICK])).toBeNull();
  });
});

describe("ensureIdentity: trả lời dưới tên fanpage (v1.1 mục 5.1)", () => {
  it("chọn đúng fanpage theo tên rồi xác nhận lại trước khi cho điền", async () => {
    const page = build();
    const r = await run(page.box, PAGE, "page", [NICK]);
    expect(r).toMatchObject({ ok: true, switched: true });
    expect(page.current).toBe(PAGE);
    expect(page.clicks).toEqual(["switcher", `option:${PAGE}`]);
  });

  it("đang ở đúng fanpage rồi thì không bấm gì", async () => {
    const page = build({ current: PAGE });
    expect(await run(page.box, PAGE, "page", [NICK])).toMatchObject({ ok: true, switched: false });
    expect(page.clicks).toEqual([]);
  });

  it("không có nút chuyển danh tính: page_not_available, không bấm gì", async () => {
    const page = build({ switcher: false });
    expect(await run(page.box, PAGE, "page", [NICK])).toMatchObject({ ok: false, reason: "page_not_available" });
    expect(page.clicks).toEqual([]);
  });

  it("fanpage không có trong danh sách (nhóm không cho, hoặc nick không quản lý): page_not_available, đóng danh sách, giữ nguyên danh tính", async () => {
    const page = build({ options: [NICK, OTHER_PAGE] });
    expect(await run(page.box, PAGE, "page", [NICK, OTHER_PAGE])).toMatchObject({ ok: false, reason: "page_not_available" });
    expect(page.current).toBe(NICK);
    expect(page.clicks).toEqual(["switcher", "switcher"]); // mở rồi đóng, không chọn mục nào
    expect(document.getElementById("menu")).toBeNull();
  }, 20_000);

  it("chọn rồi mà trang vẫn hiện danh tính cũ: identity_unverified (không điền)", async () => {
    const page = build({ reflect: false, check: false });
    const r = await run(page.box, PAGE, "page", [NICK]);
    expect(r).toMatchObject({ ok: false, reason: "identity_unverified" });
  }, 20_000);

  it("trang không ghi tên ở đâu, nhưng mở lại danh sách thấy fanpage đang được đánh dấu chọn: chấp nhận", async () => {
    const page = build({ labelled: true });
    // xoá nhãn ô trả lời sau mỗi lần vẽ để mô phỏng trang không ghi tên danh tính
    new MutationObserver(() => page.box.removeAttribute("aria-label")).observe(page.box, { attributes: true });
    page.box.removeAttribute("aria-label");
    const r = await run(page.box, PAGE, "page", [NICK]);
    expect(r).toMatchObject({ ok: true });
    expect(page.current).toBe(PAGE);
    expect(document.getElementById("menu")).toBeNull();
  }, 20_000);

  it("không bao giờ bấm nút gửi trong lúc chọn danh tính", async () => {
    for (const o of [{}, { labelled: false }, { options: [NICK] }, { reflect: false, check: false }] as Opts[]) {
      const page = build(o);
      await run(page.box, PAGE, "page", [NICK]);
      expect(page.clicks).not.toContain("SEND");
    }
  }, 40_000);
});

describe("ensureIdentity: trả lời bằng nick", () => {
  it("không có nút chuyển và trang không ghi tên fanpage nào: mặc định là nick", async () => {
    const page = build({ switcher: false });
    expect(await run(page.box, NICK, "account", [PAGE])).toMatchObject({ ok: true, switched: false });
  });

  it("ô trả lời đang ở danh tính fanpage: chuyển về nick trước khi điền", async () => {
    const page = build({ current: PAGE });
    expect(await run(page.box, NICK, "account", [PAGE])).toMatchObject({ ok: true, switched: true });
    expect(page.current).toBe(NICK);
  });

  it("đang ở fanpage mà không có nút chuyển: không điền (tránh câu của nick gửi dưới tên fanpage)", async () => {
    const page = build({ current: PAGE, switcher: false });
    expect(await run(page.box, NICK, "account", [PAGE])).toMatchObject({ ok: false, reason: "identity_unverified" });
  });

  it("nút tìm theo cấu trúc mở ra danh sách không có tên nào đã biết: coi như vẫn là nick, đóng danh sách", async () => {
    const page = build({ labelled: false, options: ["Mục lạ 1", "Mục lạ 2"] });
    page.box.removeAttribute("aria-label");
    const spy = vi.fn();
    document.getElementById("send")!.addEventListener("click", spy);
    expect(await run(page.box, NICK, "account", [PAGE])).toMatchObject({ ok: true, switched: false });
    expect(page.clicks).toEqual(["switcher", "switcher"]);
    expect(spy).not.toHaveBeenCalled();
  }, 20_000);
});
