import "server-only";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { compareSessionImages } from "@/lib/jobs/order";
import type { LayoutSnapshot } from "@/lib/jobs/snapshot";
import { shared } from "@/lib/jobs/throttle";
import { getStorage } from "@/lib/storage";
import { buildCaption, publicSessionUrl } from "./caption";
import { ZaloError } from "./client";
import { getBotClient, NO_BOT_MESSAGE } from "./index";
import { getZaloSettings, groupSendEnabled } from "./settings";
import { toJpeg } from "@/lib/imaging/webp";

const RETRY_DELAYS_MS = [3_000, 8_000]; // lỗi tạm thời: thử lại tối đa 2 lần
/** Lỗi mà gửi tiếp ảnh khác vào cùng nhóm cũng sẽ lỗi y hệt: dừng cả loạt. */
const STOP_CODES = new Set([401, 410, 422, 429]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type DeliverResult =
  | { outcome: "sent" }
  | { outcome: "skipped" }
  | { outcome: "failed"; error: string; stop: boolean };

/** botId: bot đang ở trong nhóm (null = bot trong .env / bot mặc định). */
type GroupRef = { id: string; chatId: string; botId: string | null };

function errText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}

/**
 * Gửi MỘT ảnh vào MỘT nhóm. Ghi lại kết quả để không gửi trùng: ảnh đã gửi thành công vào nhóm này thì bỏ qua,
 * trừ khi `force`. Toàn hệ thống gửi lần lượt từng ảnh theo thứ tự đến (một hàng đợi chung).
 */
export async function deliverImage(imageId: string, group: GroupRef, opts?: { force?: boolean }): Promise<DeliverResult> {
  const client = await getBotClient(group.botId);
  if (!client) return { outcome: "failed", error: NO_BOT_MESSAGE, stop: true };
  if (!(await groupSendEnabled())) return { outcome: "failed", error: "Chức năng gửi ảnh vào nhóm Zalo đang tắt (Quản trị > Zalo).", stop: true };

  const settings = await getZaloSettings(); // mẫu chữ đi kèm ảnh và khoảng nghỉ giữa các ảnh

  return shared().zaloSend(async () => {
    const existing = await db.zaloDelivery.findUnique({ where: { imageId_groupId: { imageId, groupId: group.id } } });
    if (existing?.status === "SENT" && !opts?.force) return { outcome: "skipped" } as const;

    const img = await db.generatedImage.findUnique({
      where: { id: imageId },
      include: {
        createdBy: { select: { name: true } },
        session: { include: { logo: { include: { brand: { include: { customer: true } } } } } },
      },
    });
    if (!img || img.status !== "SUCCESS" || !img.finalPath) {
      return { outcome: "failed", error: "Ảnh chưa tạo xong.", stop: false } as const;
    }

    const snapshot = img.layoutSnapshot as unknown as LayoutSnapshot;
    const label =
      img.kind === "DESIGN" && snapshot.design
        ? `${snapshot.title} · ${snapshot.design.styleName}`
        : snapshot.imageNumber
          ? `Ảnh ${snapshot.imageNumber} · ${snapshot.title}`
          : snapshot.title;
    const caption = buildCaption(
      {
        brandName: img.session.logo.brand.name,
        customerName: img.session.logo.brand.customer.name,
        label,
        saleName: img.createdBy.name,
        sessionUrl: publicSessionUrl(getEnv().APP_URL, img.sessionId),
      },
      settings.captionTemplate,
    );

    let error: ZaloError | Error | undefined;
    let messageId: string | undefined;
    try {
      const image = await toJpeg(await getStorage().get(img.finalPath)); // ảnh lưu là WebP; gửi Zalo bằng JPEG
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await client.sendPhoto({ chatId: group.chatId, image, fileName: `${img.id}.jpg`, caption });
          messageId = r?.message_id;
          error = undefined;
          break;
        } catch (e) {
          error = e instanceof Error ? e : new Error(String(e));
          const retryable = e instanceof ZaloError && e.retryable;
          if (!retryable || attempt >= RETRY_DELAYS_MS.length) break;
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e)); // không đọc được file ảnh
    }

    await db.zaloDelivery.upsert({
      where: { imageId_groupId: { imageId, groupId: group.id } },
      create: { imageId, groupId: group.id, status: error ? "FAILED" : "SENT", messageId: messageId ?? null, error: error ? errText(error) : null },
      update: { status: error ? "FAILED" : "SENT", messageId: messageId ?? null, error: error ? errText(error) : null },
    });

    await sleep(settings.sendGapMs);
    if (error) {
      return { outcome: "failed", error: errText(error), stop: error instanceof ZaloError && STOP_CODES.has(error.code) } as const;
    }
    return { outcome: "sent" } as const;
  });
}

export type SessionSendSummary = { total: number; sent: number; skipped: number; failed: number; error?: string };

/** Gửi mọi ảnh đã xong của một phiên vào một nhóm (theo thứ tự hiển thị). Ảnh đã gửi vào nhóm này thì bỏ qua. */
export async function sendSessionImages(sessionId: string, groupId: string, opts?: { force?: boolean }): Promise<SessionSendSummary> {
  const group = await db.zaloGroup.findUnique({ where: { id: groupId }, select: { id: true, chatId: true, isActive: true, botId: true } });
  if (!group || !group.isActive) return { total: 0, sent: 0, skipped: 0, failed: 0, error: "Nhóm Zalo không tồn tại hoặc đang tắt." };

  const images = await db.generatedImage.findMany({
    where: { sessionId, status: "SUCCESS", retries: { none: {} } },
    select: { id: true, materialId: true, variantIndex: true, createdAt: true, sheet: { select: { sortOrder: true } } },
  });
  images.sort(compareSessionImages);

  const summary: SessionSendSummary = { total: images.length, sent: 0, skipped: 0, failed: 0 };
  for (const img of images) {
    const r = await deliverImage(img.id, group, opts);
    if (r.outcome === "sent") summary.sent++;
    else if (r.outcome === "skipped") summary.skipped++;
    else {
      summary.failed++;
      summary.error ??= r.error;
      if (r.stop) {
        // còn lại chắc chắn lỗi y hệt: dừng, đếm các ảnh chưa thử là lỗi
        summary.failed += images.length - (summary.sent + summary.skipped + summary.failed);
        break;
      }
    }
  }
  return summary;
}
