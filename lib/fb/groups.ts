import "server-only";
import { db } from "@/lib/db";
import { groupNameFromUrl } from "./urls";

/**
 * Tìm nhóm theo link chuẩn, chưa có thì tự tạo với tên tạm lấy từ link (quản trị sửa tên và ghi chú ở trang Nhóm).
 * Dùng khi đăng ký bài: tài liệu thiết kế mục 7.5 "server tự tạo fb_groups nếu chưa có nhóm đó".
 */
export async function ensureGroup(groupUrl: string): Promise<string> {
  const existing = await db.fbGroup.findUnique({ where: { url: groupUrl }, select: { id: true } });
  if (existing) return existing.id;
  try {
    const created = await db.fbGroup.create({ data: { url: groupUrl, name: groupNameFromUrl(groupUrl) }, select: { id: true } });
    return created.id;
  } catch {
    // hai yêu cầu cùng tạo một nhóm: lấy bản vừa được tạo
    const again = await db.fbGroup.findUnique({ where: { url: groupUrl }, select: { id: true } });
    if (again) return again.id;
    throw new Error("Không tạo được nhóm.");
  }
}
