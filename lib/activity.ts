import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import type { ActivityAction } from "./activity-types";

/** Giữ nhật ký trong một năm; dòng cũ hơn được dọn mỗi khi có người đăng nhập. */
const RETENTION_DAYS = 365;

/** Địa chỉ mạng của người gọi (qua Cloudflare / reverse proxy), hoặc null khi không ở trong một request. */
async function requestIp(): Promise<string | null> {
  try {
    const h = await headers();
    const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
    return ip ? ip.slice(0, 64) : null;
  } catch {
    return null; // gọi ngoài request (script, việc nền)
  }
}

export type ActivityInput = {
  /** Người làm. Bỏ trống khi chưa biết là ai (đăng nhập sai): lúc đó truyền `actorName` là email đã gõ. */
  actor?: { id: string; name: string } | null;
  actorName?: string;
  action: ActivityAction;
  /** Đối tượng bị tác động, viết cho người đọc: "Lan (lan@...)", "Bot nhóm khách sỉ"... */
  target?: string | null;
  detail?: string | null;
};

/**
 * Ghi một dòng nhật ký hoạt động. KHÔNG bao giờ ném lỗi: ghi nhật ký hỏng không được làm hỏng việc chính.
 * Không ghi mật khẩu, token hay mã kết nối vào `target`/`detail`.
 */
export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    await db.activityLog.create({
      data: {
        actorId: input.actor?.id ?? null,
        actorName: (input.actor?.name ?? input.actorName ?? "(không rõ)").slice(0, 150),
        action: input.action,
        target: input.target ? input.target.slice(0, 200) : null,
        detail: input.detail ? input.detail.slice(0, 500) : null,
        ip: await requestIp(),
      },
    });
  } catch (e) {
    console.error("Nhật ký hoạt động: không ghi được:", e instanceof Error ? e.message : e);
  }
}

/** Xóa các dòng quá hạn lưu. Lỗi thì bỏ qua. */
export async function pruneActivityLogs(): Promise<void> {
  try {
    await db.activityLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_DAYS * 24 * 3600_000) } } });
  } catch {
    /* lần sau dọn tiếp */
  }
}
