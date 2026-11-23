/** Chỉ cho máy chủ tải ảnh từ CDN chính thức của Pinterest, không biến đường copy ảnh thành proxy tùy ý (SSRF). */
export function isPinterestImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && (url.hostname === "i.pinimg.com" || url.hostname.endsWith(".pinimg.com"));
  } catch {
    return false;
  }
}
