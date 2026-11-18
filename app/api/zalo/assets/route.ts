import path from "node:path";
import { randomUUID } from "node:crypto";
import { apiUser, isResponse, jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { detectMedia, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, mb } from "@/lib/zalo/media";
import { getZaloSettings } from "@/lib/zalo/settings";

/**
 * Tải ảnh/video lên thư viện kịch bản chăm sóc. Đường dẫn này không qua proxy.ts (video lớn) nên tự kiểm tra đăng nhập.
 * Loại file được nhận dạng theo nội dung (không tin loại do trình duyệt báo, vì Windows hay báo rỗng với file .mp4).
 */
export async function POST(req: Request) {
  const user = await apiUser();
  if (isResponse(user)) return user;
  const s = await getZaloSettings();
  if (!s.enabled || !s.care) return jsonError(403, "Kịch bản chăm sóc đang tắt.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "Máy chủ không đọc được file tải lên (có thể file quá lớn hoặc mạng bị ngắt). Thử file nhỏ hơn 50MB.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return jsonError(400, "Vui lòng chọn một file ảnh hoặc video.");

  const buf = Buffer.from(await file.arrayBuffer());
  const media = detectMedia(buf.subarray(0, 16));
  if (!media) return jsonError(400, "Không nhận ra đây là ảnh (JPG, PNG, WEBP) hay video (MP4, MOV). Hãy chọn đúng loại file.");
  if (media.kind === "IMAGE" && buf.length > MAX_IMAGE_BYTES) return jsonError(400, `Ảnh ${mb(buf.length)} quá lớn (tối đa ${mb(MAX_IMAGE_BYTES)}).`);
  if (media.kind === "VIDEO" && buf.length > MAX_VIDEO_BYTES) {
    return jsonError(400, `Video ${mb(buf.length)} vượt giới hạn ${mb(MAX_VIDEO_BYTES)} của Zalo. Hãy nén video nhỏ lại (ví dụ xuất 480p/720p ngắn hơn) rồi tải lên.`);
  }

  const title = String(form.get("title") ?? "").trim().slice(0, 150) || path.parse(file.name).name.slice(0, 150) || "Tư liệu";
  const description = String(form.get("description") ?? "").trim().slice(0, 1000) || null;

  const key = `zalo-assets/${randomUUID()}.${media.ext}`;
  await getStorage().put(key, buf);
  const asset = await db.zaloAsset.create({
    data: { kind: media.kind, title, description, path: key, mimeType: media.mime, sizeBytes: buf.length, createdById: user.id },
  });
  return Response.json({ id: asset.id, kind: media.kind });
}
