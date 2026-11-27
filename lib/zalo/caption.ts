import { ZALO_MAX_TEXT } from "./text";

export type CaptionInput = {
  brandName: string;
  customerName: string;
  /** nhãn ảnh: "Ảnh 1 · tên trang mẫu" hoặc "chất liệu · kiểu thiết kế" */
  label: string;
  saleName: string;
  /** link mở phiên trên web (chỉ đưa vào khi là địa chỉ công khai) */
  sessionUrl?: string;
};

export const DEFAULT_CAPTION_TEMPLATE = "{thuong_hieu} · {khach}\n{nhan}\nSale: {sale}\n{link}";

/** Các chỗ trống dùng được trong mẫu chữ (cho giao diện cài đặt và trang hướng dẫn). */
export const CAPTION_PLACEHOLDERS: { key: string; desc: string }[] = [
  { key: "{thuong_hieu}", desc: "tên thương hiệu của khách" },
  { key: "{khach}", desc: "tên khách hàng" },
  { key: "{nhan}", desc: "nhãn ảnh, ví dụ \"Ảnh 1 · Trang mẫu\" hoặc \"Mica · Kiểu hiện đại\"" },
  { key: "{sale}", desc: "tên sale đã tạo ảnh" },
  { key: "{link}", desc: "link mở phiên trên web (chỉ có khi APP_URL là https công khai)" },
];

/**
 * Điền một mẫu chữ. `values` là bảng "chỗ trống → nội dung", khóa viết cả ngoặc nhọn ("{link}"). Dòng nào có chỗ trống mà
 * không có thông tin nào để điền thì bỏ cả dòng. Tối đa 2000 ký tự theo quy định của Zalo.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  const keys = Object.keys(values);
  if (keys.length === 0) return template.trim().slice(0, ZALO_MAX_TEXT);
  const placeholder = new RegExp(keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  const lines: string[] = [];
  for (const raw of template.split(/\r?\n/)) {
    const found = raw.match(placeholder) ?? [];
    if (found.length > 0 && found.every((m) => !values[m])) continue;
    lines.push(raw.replace(placeholder, (m) => values[m] ?? "").trimEnd());
  }
  return lines.join("\n").trim().slice(0, ZALO_MAX_TEXT);
}

/**
 * Nội dung chữ đi kèm ảnh trong nhóm Zalo, dựng từ mẫu cấu hình. Dòng nào có chỗ trống mà không có thông tin nào để điền thì bỏ cả dòng
 * (ví dụ dòng {link} khi chưa có địa chỉ công khai). Tối đa 2000 ký tự theo quy định của Zalo.
 */
export function buildCaption(c: CaptionInput, template: string = DEFAULT_CAPTION_TEMPLATE): string {
  return fillTemplate(template, {
    "{thuong_hieu}": c.brandName,
    "{khach}": c.customerName,
    "{nhan}": c.label,
    "{sale}": c.saleName,
    "{link}": c.sessionUrl ?? "",
  });
}

/** Link phiên chỉ có ích với đồng nghiệp khi web có địa chỉ công khai (https), không đưa localhost vào nhóm. */
export function publicSessionUrl(appUrl: string, sessionId: string): string | undefined {
  return appUrl.startsWith("https://") ? `${appUrl.replace(/\/$/, "")}/sessions/${sessionId}` : undefined;
}
