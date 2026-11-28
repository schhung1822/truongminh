/**
 * Phần "reply" của báo cáo chẩn đoán: cấu trúc của luồng trả lời trên trang đang mở, để chỉnh REPLY_LABELS trong selectors.ts mà
 * người phát triển không cần truy cập Facebook. Chỉ ĐỌC trang, không bấm gì. Mọi nhãn đều được che tên (maskLabel): tên nick
 * thành {nick}, tên fanpage thành {page}, tên người khác thành {…}.
 */
import type { DiagnosticReport } from "../types";
import { commentArticles } from "./extract";
import { labelOf, visibleEditables } from "./fill";
import { identityCandidates } from "./identity";
import { findReplyAction } from "./reply";
import { maskLabel } from "./selectors";

type Known = { nick?: string | null; pages?: string[] };

const describe = (el: Element, known: Known) => {
  const label = maskLabel(labelOf(el).split(/\r?\n/)[0] ?? "", known);
  const aria = maskLabel(el.getAttribute("aria-label") ?? "", known);
  const img = el.querySelector("img[alt]")?.getAttribute("alt");
  return [
    `text="${label.slice(0, 60)}"`,
    `aria-label="${aria.slice(0, 60)}"`,
    `haspopup=${el.getAttribute("aria-haspopup") ?? "không"}`,
    `role=${el.getAttribute("role") ?? el.tagName.toLowerCase()}`,
    `avatarAlt=${img ? `"${maskLabel(img, known).slice(0, 40)}"` : "không"}`,
    `inForm=${el.closest("form") ? "có" : "không"}`,
  ].join(" ");
};

export function diagnoseReply(known: Known): NonNullable<DiagnosticReport["reply"]> {
  const boxes = visibleEditables();
  const { byLabel, byStructure } = identityCandidates();
  return {
    replyActions: commentArticles().filter((a) => findReplyAction(a) !== null).length,
    textboxes: boxes.length,
    textboxLabels: [...new Set(boxes.map((b) => maskLabel(b.getAttribute("aria-label") ?? b.getAttribute("aria-placeholder") ?? "(không có nhãn)", known)))].slice(0, 6),
    identityByLabel: byLabel.slice(0, 6).map((el) => describe(el, known)),
    identityByStructure: byStructure.slice(0, 6).map((el) => describe(el, known)),
  };
}
