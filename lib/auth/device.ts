/**
 * Đổi chuỗi User-Agent thành tên thiết bị dễ đọc ("Chrome trên Windows") để người dùng nhận ra các lần đăng nhập của mình
 * ở trang Tài khoản. Chỉ nhận diện thô các trình duyệt và hệ điều hành phổ biến; không rõ thì trả "Thiết bị không rõ".
 */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua.trim()) return "Thiết bị không rõ";

  // Thứ tự quan trọng: Edge, Opera, Cốc Cốc đều tự nhận kèm chữ "Chrome"; Chrome lại kèm chữ "Safari".
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /coc_coc_browser/i.test(ua)
        ? "Cốc Cốc"
        : /Firefox\/|FxiOS\//.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : null;

  const os = /iPhone|iPod/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "máy Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : null;

  if (browser && os) return `${browser} trên ${os}`;
  return browser ?? os ?? "Thiết bị không rõ";
}
