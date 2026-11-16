import path from "node:path";
import { apiUser, isResponse, jsonError } from "@/lib/api";
import { getStorage } from "@/lib/storage";
import { sanitizeKey } from "@/lib/storage/local";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

// Phục vụ ảnh từ kho. Bắt buộc đăng nhập; ảnh nằm ngoài thư mục public.
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const user = await apiUser();
  if (isResponse(user)) return user;

  const { key: parts } = await ctx.params;
  let key: string;
  try {
    key = sanitizeKey(parts.map(decodeURIComponent).join("/"));
  } catch {
    return jsonError(400, "Đường dẫn không hợp lệ.");
  }

  const type = TYPES[path.extname(key).toLowerCase()];
  if (!type) return jsonError(404, "Không tìm thấy file.");

  try {
    const data = await getStorage().get(key);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        // SVG có thể chứa script: không cho chạy khi mở trực tiếp
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return jsonError(404, "Không tìm thấy file.");
  }
}
