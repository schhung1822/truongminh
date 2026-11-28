/**
 * Chọn danh tính bình luận: nick hay fanpage (v1.1 mục 5.1). Mọi lần bấm đi qua safeClick của fill.ts.
 *
 * Nguyên tắc "không chắc thì không điền":
 * - Trả lời dưới tên fanpage: phải tìm thấy nút chuyển danh tính, thấy fanpage trong danh sách, và sau khi chọn phải XÁC NHẬN
 *   lại được danh tính đang dùng đúng là fanpage. Thiếu nút hoặc thiếu fanpage: page_not_available. Chọn rồi mà không xác nhận
 *   được: identity_unverified. Cả hai trường hợp đều không điền gì.
 * - Trả lời bằng nick: nếu trang cho thấy ô trả lời đang ở danh tính một fanpage thì phải chuyển về nick trước; không chuyển
 *   được thì cũng không điền (tránh câu của nick bị gửi dưới tên fanpage).
 *
 * CHƯA XÁC MINH trên Facebook thật: xem ghi chú ở REPLY_LABELS trong selectors.ts.
 */
import { actAndWaitForDom } from "./dom-wait";
import { sleep } from "./extract";
import { EDITABLE, labelOf, safeClick } from "./fill";
import { labelHasName, replyLabelMatches, sameName } from "./selectors";

const isVisible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

const BUTTONS = '[role="button"], button, [aria-haspopup]';
const MENUS = '[role="menu"], [role="listbox"], [role="radiogroup"], [role="dialog"]';
const OPTIONS = '[role="menuitemradio"], [role="menuitem"], [role="option"], [role="radio"], [role="menuitemcheckbox"]';

const labelsOf = (el: Element) => [labelOf(el), el.getAttribute("aria-label") ?? "", el.getAttribute("title") ?? ""];

/** Vùng soạn thảo quanh ô trả lời: đi lên tối đa 8 cấp, dừng trước khi lọt ra ngoài phạm vi một bình luận / một bài. */
function composerScopes(box: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  let el: HTMLElement | null = box.parentElement;
  for (let i = 0; el && i < 8; i++, el = el.parentElement) {
    if (el === document.body) break;
    out.push(el);
    if (el.matches("form")) break;
  }
  return out;
}

/** Nút có ảnh đại diện bên trong (cách 3: nhận theo cấu trúc khi nhãn không khớp). */
const hasAvatar = (el: Element) => el.querySelector("img, image, svg") !== null;

export type SwitcherHit = { el: HTMLElement; via: "label_haspopup" | "label" | "structure" };

/**
 * identity_switcher: ba cách tìm, theo thứ tự tin cậy giảm dần.
 * 1. Nút mở danh sách (aria-haspopup) có nhãn / aria-label của bộ chọn danh tính.
 * 2. Nút bất kỳ có nhãn của bộ chọn danh tính.
 * 3. Theo cấu trúc: nút mở danh sách có ảnh đại diện, nằm ngay trong vùng soạn thảo của ô trả lời.
 * Cách 1 và 2 ưu tiên nút gần ô trả lời nhất, rồi mới tới phần còn lại của trang.
 */
export function findIdentitySwitcher(box: HTMLElement): SwitcherHit | null {
  const scopes: ParentNode[] = [...composerScopes(box), document];
  const byLabel = (el: Element) => labelsOf(el).some((l) => replyLabelMatches(l, "identitySwitcher"));
  const usable = (el: HTMLElement) => isVisible(el) && !el.matches(EDITABLE) && !el.closest(EDITABLE);

  for (const scope of scopes) {
    const hit = [...scope.querySelectorAll<HTMLElement>("[aria-haspopup]")].find((el) => usable(el) && byLabel(el));
    if (hit) return { el: hit, via: "label_haspopup" };
  }
  for (const scope of scopes) {
    const hit = [...scope.querySelectorAll<HTMLElement>(BUTTONS)].find((el) => usable(el) && byLabel(el));
    if (hit) return { el: hit, via: "label" };
  }
  for (const scope of composerScopes(box)) {
    const hit = [...scope.querySelectorAll<HTMLElement>("[aria-haspopup]")].find((el) => usable(el) && hasAvatar(el) && labelOf(el).length <= 80);
    if (hit) return { el: hit, via: "structure" };
  }
  return null;
}

/**
 * Danh tính đang dùng, đọc từ những chỗ Facebook ghi tên người bình luận: nhãn của ô trả lời ("Bình luận dưới tên X"), nhãn hoặc
 * ảnh đại diện của nút chuyển danh tính. Trả về đúng một tên trong `names` nếu thấy; không thấy tên nào thì null (không đoán).
 */
export function currentIdentity(box: HTMLElement, switcher: HTMLElement | null, names: string[]): string | null {
  const texts = [box.getAttribute("aria-label"), box.getAttribute("aria-placeholder"), box.getAttribute("placeholder"), box.getAttribute("aria-description")];
  if (switcher) {
    texts.push(...labelsOf(switcher));
    for (const img of switcher.querySelectorAll("img[alt], [aria-label]")) texts.push(img.getAttribute("alt"), img.getAttribute("aria-label"));
  }
  // tên dài so trước, để "Vật Liệu ABC Hà Nội" không bị nhận nhầm thành "Vật Liệu ABC"
  const sorted = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const t of texts) {
    const hit = sorted.find((n) => labelHasName(t, n));
    if (hit) return hit;
  }
  return null;
}

/** Danh sách danh tính đang mở (menu, listbox, hộp thoại) và các mục trong đó. */
function openOptions(): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  for (const menu of document.querySelectorAll<HTMLElement>(MENUS)) {
    if (!isVisible(menu)) continue;
    for (const item of menu.querySelectorAll<HTMLElement>(OPTIONS)) if (isVisible(item)) seen.add(item);
  }
  return [...seen];
}

/** Mục này có phải của tên đã cho không: dòng đầu của nhãn đúng là tên đó. */
const optionIs = (o: Element, name: string) => labelsOf(o).some((l) => sameName(l.split(/\r?\n/).find((x) => x.trim()) ?? "", name));

/** Mục của danh sách ứng với tên cần chọn. */
function optionFor(name: string): HTMLElement | null {
  return openOptions().find((o) => optionIs(o, name)) ?? null;
}

const isChecked = (el: Element) => el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-selected") === "true";

/** Bấm (qua safeClick) rồi chờ trang vẽ xong phần thay đổi do lần bấm đó. Trả false nếu safeClick từ chối. */
async function clickAndSettle(el: HTMLElement, purpose: "identity_switcher" | "identity_option", timeoutMs: number): Promise<boolean> {
  let clicked = false;
  await actAndWaitForDom(
    () => {
      clicked = safeClick(el, purpose);
    },
    { timeoutMs, quietMs: 400 },
  );
  return clicked;
}

export type IdentityResult = { ok: true; box: HTMLElement; switched: boolean } | { ok: false; reason: "page_not_available" | "identity_unverified"; detail: string };

/**
 * Bảo đảm ô trả lời đang ở đúng danh tính `target` (tên fanpage, hoặc tên nick) trước khi điền.
 * `others` là các tên còn lại có thể đang được chọn; `reacquireBox` lấy lại ô trả lời nếu Facebook vẽ lại sau khi đổi danh tính.
 */
export async function ensureIdentity(input: { box: HTMLElement; target: string; kind: "page" | "account"; others: string[]; reacquireBox: () => Promise<HTMLElement | null> }): Promise<IdentityResult> {
  const names = [input.target, ...input.others];
  let box = input.box;
  const found = findIdentitySwitcher(box);
  const now = currentIdentity(box, found?.el ?? null, names);
  if (sameName(now, input.target)) return { ok: true, box, switched: false };

  if (!found) {
    // Không có nút chuyển danh tính: chỉ có thể đang là nick
    if (input.kind === "account" && now === null) return { ok: true, box, switched: false };
    return input.kind === "page"
      ? { ok: false, reason: "page_not_available", detail: "không thấy nút chuyển danh tính bình luận" }
      : { ok: false, reason: "identity_unverified", detail: "ô trả lời đang ở danh tính khác mà không thấy nút chuyển danh tính" };
  }
  // Trả lời bằng nick, có nút chuyển nhưng không đọc được danh tính hiện tại: mở danh sách ra xem cho chắc

  if (!(await clickAndSettle(found.el, "identity_switcher", 2_500))) return { ok: false, reason: "page_not_available", detail: "nút chuyển danh tính không bấm được" };
  let option = optionFor(input.target);
  for (let i = 0; i < 4 && !option; i++) {
    await sleep(500);
    option = optionFor(input.target);
  }
  if (!option) {
    // Danh sách không có tên cần chọn. Xem có fanpage nào đang được đánh dấu chọn không, rồi đóng danh sách (bấm lại chính nút
    // đó), không chọn gì.
    const otherChecked = openOptions().some((o) => isChecked(o) && input.others.some((n) => optionIs(o, n)));
    if (openOptions().length > 0) await clickAndSettle(found.el, "identity_switcher", 1_500);
    if (input.kind === "page") return { ok: false, reason: "page_not_available", detail: `không có fanpage trong danh sách chuyển danh tính (tìm nút bằng ${found.via})` };
    // Trả lời bằng nick: danh sách không cho thấy fanpage nào đang được chọn thì danh tính vẫn là nick (nút vừa mở có thể không
    // phải bộ chọn danh tính, hoặc tên nick trên webapp khác tên trên Facebook)
    if (otherChecked) return { ok: false, reason: "identity_unverified", detail: "ô trả lời đang ở danh tính fanpage và không thấy nick trong danh sách" };
    const fresh = box.isConnected ? box : await input.reacquireBox();
    return fresh ? { ok: true, box: fresh, switched: false } : { ok: false, reason: "identity_unverified", detail: "ô trả lời biến mất sau khi mở danh sách danh tính" };
  }

  const alreadyChecked = isChecked(option);
  if (!(await clickAndSettle(option, "identity_option", 3_000))) return { ok: false, reason: "identity_unverified", detail: "mục danh tính không bấm được" };

  // Facebook có thể vẽ lại vùng soạn thảo sau khi đổi danh tính
  if (!box.isConnected) {
    const again = await input.reacquireBox();
    if (!again) return { ok: false, reason: "identity_unverified", detail: "ô trả lời biến mất sau khi đổi danh tính" };
    box = again;
  }

  // Xác nhận lại (v1.1 mục 5.1 bước 2): tên phải hiện ở ô trả lời hoặc ở nút chuyển danh tính
  // (Facebook vẽ lại chậm một nhịp: chờ tối đa khoảng 3 giây rồi mới kết luận)
  let seen: string | null = null;
  for (let i = 0; i < 8; i++) {
    const after = findIdentitySwitcher(box);
    seen = currentIdentity(box, after?.el ?? null, names);
    if (sameName(seen, input.target)) return { ok: true, box, switched: !alreadyChecked };
    await sleep(400);
  }
  if (seen !== null) return { ok: false, reason: "identity_unverified", detail: "sau khi chọn, trang vẫn hiện danh tính khác" };
  // Trang không ghi tên ở đâu cả: chỉ tin khi chính mục vừa bấm là mục đang được đánh dấu chọn trong danh sách
  const after = findIdentitySwitcher(box);
  if (after && (await clickAndSettle(after.el, "identity_switcher", 2_500))) {
    const again = optionFor(input.target);
    const confirmed = again !== null && isChecked(again);
    if (openOptions().length > 0) await clickAndSettle(after.el, "identity_switcher", 1_500); // đóng lại, không chọn gì thêm
    if (confirmed) {
      const fresh = box.isConnected ? box : await input.reacquireBox();
      if (fresh) return { ok: true, box: fresh, switched: !alreadyChecked };
    }
  }
  return { ok: false, reason: "identity_unverified", detail: "không xác nhận được danh tính sau khi chọn" };
}

/** Các nút ứng viên của bộ chọn danh tính trên trang, cho báo cáo chẩn đoán. Trả về phần tử; nơi gọi tự che tên trong nhãn. */
export function identityCandidates(): { byLabel: HTMLElement[]; byStructure: HTMLElement[] } {
  const all = [...document.querySelectorAll<HTMLElement>(BUTTONS)].filter((el) => isVisible(el) && !el.closest(EDITABLE));
  const byLabel = all.filter((el) => labelsOf(el).some((l) => replyLabelMatches(l, "identitySwitcher")));
  const boxes = [...document.querySelectorAll<HTMLElement>(EDITABLE)].filter(isVisible);
  const near = new Set<HTMLElement>();
  for (const box of boxes) for (const scope of composerScopes(box)) for (const el of scope.querySelectorAll<HTMLElement>("[aria-haspopup]")) if (isVisible(el) && hasAvatar(el)) near.add(el);
  return { byLabel, byStructure: [...near].filter((el) => !byLabel.includes(el)) };
}
