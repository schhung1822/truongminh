/** Nhận dạng ảnh/video tải lên thư viện kịch bản chăm sóc. Dựa vào nội dung file (không tin tên hay loại do trình duyệt báo). */

export type DetectedMedia = { kind: "IMAGE" | "VIDEO"; ext: string; mime: string };

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Zalo chỉ cho gửi file tối đa 50MB qua bot. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")}MB`;

/**
 * Đoán loại file từ các byte đầu: JPEG, PNG, WEBP là ảnh; "ftyp" ở byte 4-8 là họ MP4/MOV (video).
 * Trình duyệt trên Windows đôi khi báo loại video rỗng hoặc lạ, nên không dựa vào đó.
 */
export function detectMedia(head: Uint8Array): DetectedMedia | null {
  const b = (i: number) => head[i] ?? 0;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { kind: "IMAGE", ext: "jpg", mime: "image/jpeg" };
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return { kind: "IMAGE", ext: "png", mime: "image/png" };
  const s = (from: number, len: number) => String.fromCharCode(...Array.from(head.slice(from, from + len)));
  if (s(0, 4) === "RIFF" && s(8, 4) === "WEBP") return { kind: "IMAGE", ext: "webp", mime: "image/webp" };
  if (s(4, 4) === "ftyp") {
    const brand = s(8, 4);
    return brand === "qt  " ? { kind: "VIDEO", ext: "mov", mime: "video/quicktime" } : { kind: "VIDEO", ext: "mp4", mime: "video/mp4" };
  }
  return null;
}
