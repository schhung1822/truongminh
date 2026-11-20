"use client";

import { toast } from "sonner";

/** Tải một chuỗi văn bản về máy (tạo Blob ở trình duyệt, không qua máy chủ). */
export function downloadTextFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadSvgFile(svg: string, filename: string): void {
  downloadTextFile(svg, filename, "image/svg+xml;charset=utf-8");
  toast.success("Đã tải file SVG.");
}

/** Sao chép văn bản vào bộ nhớ tạm, có thông báo kết quả. Trình duyệt cũ không có clipboard API thì dùng cách dự phòng. */
export async function copyToClipboard(text: string, okMessage = "Đã sao chép."): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (!ok) throw new Error("copy failed");
    }
    toast.success(okMessage);
    return true;
  } catch {
    toast.error("Không sao chép được. Hãy bôi đen và sao chép thủ công.");
    return false;
  }
}
