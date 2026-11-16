import { zipSync } from "fflate";
import { PDFDocument } from "pdf-lib";

export type ExportFile = { name: string; data: Buffer };

/** Làm sạch tên file (Windows không cho \ / : * ? " < > |) và tránh trùng tên bằng hậu tố (2), (3)... */
export function uniqueFileNames(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((raw) => {
    const clean = raw.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "anh.jpg";
    const dot = clean.lastIndexOf(".");
    const base = dot > 0 ? clean.slice(0, dot) : clean;
    const ext = dot > 0 ? clean.slice(dot) : "";
    const n = (used.get(clean.toLowerCase()) ?? 0) + 1;
    used.set(clean.toLowerCase(), n);
    return n === 1 ? clean : `${base} (${n})${ext}`;
  });
}

/** Gói nhiều ảnh JPEG thành một file ZIP (không nén lại vì JPEG đã nén sẵn). */
export function buildZip(files: ExportFile[]): Buffer {
  const names = uniqueFileNames(files.map((f) => f.name));
  const entries: Record<string, Uint8Array> = {};
  files.forEach((f, i) => {
    entries[names[i]] = new Uint8Array(f.data);
  });
  return Buffer.from(zipSync(entries, { level: 0 }));
}

/** Một file PDF, mỗi trang một ảnh JPEG, trang có đúng tỉ lệ của ảnh (rộng 595pt như khổ A4). */
export async function buildPdf(jpegs: Buffer[], title?: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  if (title) pdf.setTitle(title);
  for (const data of jpegs) {
    const img = await pdf.embedJpg(data);
    const width = 595;
    const height = Math.round((img.height / img.width) * width);
    const page = pdf.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
  }
  return Buffer.from(await pdf.save());
}
