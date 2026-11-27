/**
 * Phần thuần (không đụng CSDL/mạng) dùng chung của trợ lý Zalo: nhận ra @tag, lấy khối JSON trong câu trả lời của AI,
 * đổi "ảnh 2 số 3, 5" thành chất liệu thật. Có test. Quy ước nói chuyện với AI nằm ở protocol.ts.
 */
import { fold } from "../text";

/* ---------- @tag ---------- */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Kiểm tra tin có nhắc tên bot không và bỏ chữ "@Tên bot" khỏi nội dung.
 * Chưa đặt tên bot thì mọi tin đều tính là lệnh (Zalo chỉ gửi cho bot các tin có tag).
 */
export function stripTag(text: string, tagName: string): { mentioned: boolean; text: string } {
  const name = tagName.trim();
  const t = text.trim();
  if (!name) return { mentioned: true, text: t };
  if (!fold(t).includes(fold(name))) return { mentioned: false, text: t };
  const re = new RegExp(`@?\\s*${escapeRe(name).replace(/\s+/g, "\\s+")}`, "gi");
  const stripped = t.replace(re, " ").replace(/\s+/g, " ").trim();
  return { mentioned: true, text: stripped || t };
}

/* ---------- Đọc JSON trong câu trả lời của AI ---------- */

/** Lấy khối JSON đầu tiên trong câu trả lời của AI (AI đôi khi bọc trong ```json hoặc thêm chữ giải thích). */
export function extractJson(raw: string): unknown | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(raw.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/* ---------- Chọn chất liệu trên ảnh catalog ---------- */

/** "ảnh 2 chọn số 3, 5" -> { image: 2, cells: [3, 5] }; không nói ảnh nào thì image = null */
export type CatalogPick = { image?: number | null; cells: number[] };

export type CatalogImageCells = { imageNumber: number; cells: { materialId: string; code: string; name: string }[] };

export const MAX_DESIGN_MATERIALS = 10;

/**
 * Đổi các lựa chọn "ảnh N số M" (số ô tính từ 1 theo chiều đọc, trùng số in trên ảnh) và mã chất liệu thành danh sách chất liệu.
 * Trả về lỗi tiếng Việt dễ hiểu để bot hỏi lại nhân viên.
 */
export function resolvePicks(
  images: CatalogImageCells[],
  picks: CatalogPick[],
  codes: string[],
): { ok: true; materials: { materialId: string; code: string; name: string }[] } | { ok: false; error: string } {
  const chosen = new Map<string, { materialId: string; code: string; name: string }>();

  for (const p of picks) {
    let img: CatalogImageCells | undefined;
    if (p.image == null) {
      if (images.length !== 1) {
        return { ok: false, error: `Số ${p.cells.join(", ")} nằm ở ảnh nào ạ? Phiên catalog có ${images.length} ảnh, anh/chị nói rõ "ảnh 2 số 3" giúp em.` };
      }
      img = images[0];
    } else {
      img = images.find((i) => i.imageNumber === p.image);
      if (!img) return { ok: false, error: `Em không thấy ảnh ${p.image} trong phiên catalog gần nhất (có ảnh ${images.map((i) => i.imageNumber).join(", ")}).` };
    }
    for (const n of p.cells) {
      const cell = img.cells[n - 1];
      if (n < 1 || !cell) return { ok: false, error: `Ảnh ${img.imageNumber} không có ô số ${n} (chỉ có ${img.cells.length} ô).` };
      chosen.set(cell.materialId, cell);
    }
  }

  const all = images.flatMap((i) => i.cells);
  for (const code of codes) {
    const hit = all.find((c) => fold(c.code) === fold(code));
    if (!hit) return { ok: false, error: `Em không thấy chất liệu mã ${code} trong phiên catalog gần nhất.` };
    chosen.set(hit.materialId, hit);
  }

  if (chosen.size === 0) return { ok: false, error: 'Anh/chị muốn thiết kế chất liệu nào ạ? Nói theo số trên ảnh, ví dụ "ảnh 1 số 3 và 5".' };
  if (chosen.size > MAX_DESIGN_MATERIALS) return { ok: false, error: `Mỗi lần thiết kế tối đa ${MAX_DESIGN_MATERIALS} chất liệu, anh/chị chọn ít lại giúp em.` };
  return { ok: true, materials: [...chosen.values()] };
}
