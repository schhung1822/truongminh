import sharp from "sharp";
import { renderText } from "./text";

/**
 * Gắn một DẢI NHÃN lên trên ảnh tham chiếu chất liệu trước khi gửi cho AI (docs/DECISIONS.md D123):
 *   [ CELL 3 ]  LEFT = FRONT (plate face)                      RIGHT = BACK (engraved marks)
 * Ảnh tham chiếu là hai ô ghép cạnh nhau (trái = mặt trước, phải = mặt sau) và AI chỉ biết ảnh nào của ô nào qua THỨ TỰ gửi,
 * nên hay tráo chất liệu giữa các ô và khắc nhầm mặt. Số ô và chữ FRONT / BACK nằm ngay trên ảnh là điểm neo AI đọc được
 * trực tiếp. Prompt dặn AI chỉ dùng dải này để đối chiếu, không vẽ nó vào ảnh kết quả.
 * Chữ bằng tiếng Anh vì prompt gửi AI viết bằng tiếng Anh.
 */

/** Đổi con số này khi đổi cách vẽ dải nhãn để các ảnh đã lưu được tạo lại (xem refTagKey ở lib/storage/keys.ts). */
export const REFERENCE_TAG_VERSION = "v1";

const BADGE_BG = "#111111";

export async function tagReference(reference: Buffer, opts: { cell: number; kind: "ENGRAVE" | "CUT" }): Promise<Buffer> {
  const meta = await sharp(reference).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W <= 0 || H <= 0) throw new Error("Không đọc được kích thước ảnh tham chiếu.");

  const strip = Math.max(72, Math.round(H * 0.14));
  const pad = Math.round(strip * 0.2);
  const leftText = opts.kind === "CUT" ? "LEFT = FRONT (use this side)" : "LEFT = FRONT (plate face)";
  const rightText = opts.kind === "CUT" ? "RIGHT = BACK (not used)" : "RIGHT = BACK (engraved marks)";

  // Chữ nhỏ dần cho tới khi cả ba phần nằm vừa bề ngang ảnh (ảnh hẹp khi một mặt là ảnh dọc)
  let size = Math.round(strip * 0.42);
  let badge = await renderText({ text: `CELL ${opts.cell}`, size: Math.round(size * 1.25), weight: "bold", color: "#ffffff" });
  let left = await renderText({ text: leftText, size, weight: "semibold", color: "#111111" });
  let right = await renderText({ text: rightText, size, weight: "semibold", color: "#111111" });
  for (let i = 0; i < 6; i++) {
    const need = pad + badge.width + pad * 2 + pad + left.width + pad * 2 + right.width + pad;
    if (need <= W) break;
    size = Math.max(10, Math.round(size * 0.85));
    badge = await renderText({ text: `CELL ${opts.cell}`, size: Math.round(size * 1.25), weight: "bold", color: "#ffffff" });
    left = await renderText({ text: leftText, size, weight: "semibold", color: "#111111" });
    right = await renderText({ text: rightText, size, weight: "semibold", color: "#111111" });
  }

  const badgeW = badge.width + pad * 2;
  const badgeH = Math.min(strip - 8, badge.height + pad);
  const badgeTop = Math.round((strip - badgeH) / 2);
  const badgeBox = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${badgeW}" height="${badgeH}"><rect width="${badgeW}" height="${badgeH}" rx="${Math.round(badgeH * 0.25)}" fill="${BADGE_BG}"/></svg>`);
  const mid = (h: number) => Math.round((strip - h) / 2);

  return sharp({ create: { width: W, height: strip + H, channels: 3, background: "#ffffff" } })
    .composite([
      { input: reference, left: 0, top: strip },
      { input: badgeBox, left: pad, top: badgeTop },
      { input: badge.input, left: pad + pad, top: badgeTop + Math.round((badgeH - badge.height) / 2) },
      { input: left.input, left: Math.min(W - left.width, pad + badgeW + pad * 2), top: mid(left.height) },
      { input: right.input, left: Math.max(0, W - pad - right.width), top: mid(right.height) },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}
