import { MAX_CAPTION_CHARS } from "./client";

export type CaptionInput = {
  brandName: string;
  customerName: string;
  /** nhãn ảnh: "Ảnh 1 · tên trang mẫu" hoặc "chất liệu · kiểu thiết kế" */
  label: string;
  saleName: string;
  /** link mở phiên trên web (chỉ đưa vào khi là địa chỉ công khai) */
  sessionUrl?: string;
};

/** Nội dung chữ đi kèm ảnh trong nhóm Zalo. Tối đa 2000 ký tự theo quy định của Zalo. */
export function buildCaption(c: CaptionInput): string {
  const lines = [`${c.brandName} · ${c.customerName}`, c.label, `Sale: ${c.saleName}`];
  if (c.sessionUrl) lines.push(c.sessionUrl);
  return lines.join("\n").slice(0, MAX_CAPTION_CHARS);
}

/** Link phiên chỉ có ích với đồng nghiệp khi web có địa chỉ công khai (https), không đưa localhost vào nhóm. */
export function publicSessionUrl(appUrl: string, sessionId: string): string | undefined {
  return appUrl.startsWith("https://") ? `${appUrl.replace(/\/$/, "")}/sessions/${sessionId}` : undefined;
}
