import "server-only";
import type { GeneratedImage } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getProvider } from "@/lib/providers";
import { ProviderFatalError } from "@/lib/providers/types";
import { getStorage } from "@/lib/storage";
import { mapLimit } from "./async";
import { renderFinal } from "./finish";
import { ensureLogoUrl, ensureMaterialUrl, NoReferenceError } from "./references";
import { MAX_ATTEMPTS, type LayoutSnapshot } from "./snapshot";
import { MAX_REFERENCE_IMAGES } from "@/lib/image-options";

const POLL_INTERVAL_MS = 3_000; // mỗi tác vụ tối đa 1 lần hỏi trạng thái / 3 giây, dù có nhiều người cùng xem
const SUBMIT_LOCK_MS = 90_000;
const FINALIZE_LOCK_MS = 180_000;
const PROCESSING_TIMEOUT_MS = 15 * 60_000;
const MAX_FINALIZE_FAILURES = 3;
const CONCURRENCY = 4;

// Đếm số lần xử lý ảnh kết quả thất bại (một bản app duy nhất nên lưu trong bộ nhớ là đủ).
const finalizeFailures = new Map<string, number>();

/** Địa chỉ để kie.ai báo kết quả về (chỉ khi bật callback). Polling vẫn luôn chạy song song. */
function callbackUrl(): string | undefined {
  const env = getEnv();
  return env.KIE_CALLBACK_ENABLED ? `${env.APP_URL.replace(/\/$/, "")}/api/webhooks/kie` : undefined;
}

function errorText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}

/**
 * Ghi nhận lỗi: nếu còn lượt tự thử lại thì đưa về PENDING (tạo tác vụ mới, KHÔNG tính vào hạn mức ngày),
 * hết lượt thì FAILED để hiện nút "Tạo lại" cho sale.
 */
async function failOrRetry(id: string, attempt: number, message: string, retryable: boolean) {
  if (retryable && attempt < MAX_ATTEMPTS) {
    await db.generatedImage.updateMany({
      where: { id, status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "PENDING", attempt: attempt + 1, taskId: null, lastPolledAt: null, errorMessage: message },
    });
  } else {
    await db.generatedImage.updateMany({
      where: { id, status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "FAILED", errorMessage: message, lastPolledAt: null },
    });
  }
}

/** Gửi tác vụ sang nhà cung cấp cho một ảnh PENDING. An toàn khi nhiều nơi cùng gọi (chỉ một nơi "chiếm" được). */
export async function submitImage(imageId: string): Promise<void> {
  const claim = await db.generatedImage.updateMany({
    where: { id: imageId, status: "PENDING", OR: [{ lastPolledAt: null }, { lastPolledAt: { lt: new Date() } }] },
    data: { lastPolledAt: new Date(Date.now() + SUBMIT_LOCK_MS) },
  });
  if (claim.count === 0) return;

  const img = await db.generatedImage.findUnique({
    where: { id: imageId },
    include: { session: { include: { logo: true } } },
  });
  if (!img) return;

  try {
    const snapshot = img.layoutSnapshot as unknown as LayoutSnapshot;
    if (1 + snapshot.cells.length > MAX_REFERENCE_IMAGES) {
      throw new NoReferenceError(`(quá ${MAX_REFERENCE_IMAGES - 1} chất liệu)`);
    }
    const materials = await db.material.findMany({ where: { id: { in: snapshot.cells.map((c) => c.materialId) } } });
    const byId = new Map(materials.map((m) => [m.id, m]));

    const [logoUrl, ...materialUrls] = await Promise.all([
      ensureLogoUrl(img.session.logo),
      ...snapshot.cells.map((c) => {
        const m = byId.get(c.materialId);
        if (!m) throw new NoReferenceError(c.code);
        return ensureMaterialUrl(m);
      }),
    ]);

    const { taskId } = await getProvider().createTask({
      model: img.model,
      prompt: img.promptUsed,
      inputUrls: [logoUrl, ...materialUrls], // ảnh 1 là logo, các ảnh sau theo đúng thứ tự ô
      aspectRatio: img.aspectRatio,
      resolution: img.resolution,
      callbackUrl: callbackUrl(),
    });
    await db.generatedImage.updateMany({
      where: { id: imageId, status: "PENDING" },
      data: { status: "PROCESSING", taskId, lastPolledAt: null },
    });
  } catch (e) {
    console.error(`submitImage ${imageId} lỗi:`, errorText(e));
    const retryable = !(e instanceof NoReferenceError || e instanceof ProviderFatalError);
    await failOrRetry(imageId, img.attempt, errorText(e), retryable);
  }
}

/** Hỏi nhà cung cấp về một ảnh PROCESSING; xong thì tải về, hoàn thiện và lưu. */
export async function pollImage(img: GeneratedImage): Promise<void> {
  if (Date.now() - img.createdAt.getTime() > PROCESSING_TIMEOUT_MS) {
    await failOrRetry(img.id, MAX_ATTEMPTS, "Quá thời gian chờ nhà cung cấp tạo ảnh.", false);
    return;
  }
  if (!img.taskId) {
    await failOrRetry(img.id, img.attempt, "Thiếu mã tác vụ.", true);
    return;
  }

  const claim = await db.generatedImage.updateMany({
    where: {
      id: img.id,
      status: "PROCESSING",
      OR: [{ lastPolledAt: null }, { lastPolledAt: { lt: new Date(Date.now() - POLL_INTERVAL_MS) } }],
    },
    data: { lastPolledAt: new Date() },
  });
  if (claim.count === 0) return;

  let info;
  try {
    info = await getProvider().getTask(img.taskId);
  } catch (e) {
    console.error(`getTask ${img.id} lỗi (sẽ hỏi lại):`, errorText(e));
    return; // lỗi mạng thoáng qua: hỏi lại ở lượt sau, đã có giới hạn thời gian chờ tổng
  }

  if (info.status === "PROCESSING") return;
  if (info.status === "FAILED") {
    await failOrRetry(img.id, img.attempt, info.error ?? "Nhà cung cấp báo lỗi.", true);
    return;
  }

  // SUCCESS: khóa lâu hơn trong lúc tải và xử lý ảnh để request khác không làm trùng
  await db.generatedImage.updateMany({
    where: { id: img.id, status: "PROCESSING" },
    data: { lastPolledAt: new Date(Date.now() + FINALIZE_LOCK_MS) },
  });
  await finalizeImage(img.id, info.resultUrl ?? "", info.credits);
}

async function finalizeImage(imageId: string, resultUrl: string, credits?: number): Promise<void> {
  try {
    const img = await db.generatedImage.findUnique({
      where: { id: imageId },
      include: { session: { include: { logo: { include: { brand: true } } } } },
    });
    if (!img || img.status !== "PROCESSING") return;
    if (!resultUrl) throw new Error("Nhà cung cấp không trả về đường dẫn ảnh.");

    const provider = getProvider();
    const { buffer, contentType } = await provider.downloadResult(resultUrl);
    const ext = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
    const storage = getStorage();
    const originalKey = `images/${img.sessionId}/${img.id}-original.${ext}`;
    await storage.put(originalKey, buffer); // giữ ảnh gốc ngay: link của nhà cung cấp sẽ hết hạn

    const final = await renderFinal(img, img.session.logo.brand.name, buffer);
    const finalKey = `images/${img.sessionId}/${img.id}-final.jpg`;
    await storage.put(finalKey, final);

    await db.generatedImage.updateMany({
      where: { id: imageId, status: "PROCESSING" },
      data: {
        status: "SUCCESS",
        originalPath: originalKey,
        finalPath: finalKey,
        errorMessage: null,
        lastPolledAt: null,
        ...(credits !== undefined ? { costCredits: credits } : {}),
      },
    });
    finalizeFailures.delete(imageId);
  } catch (e) {
    const n = (finalizeFailures.get(imageId) ?? 0) + 1;
    console.error(`finalizeImage ${imageId} lỗi lần ${n}:`, errorText(e));
    if (n >= MAX_FINALIZE_FAILURES) {
      finalizeFailures.delete(imageId);
      await failOrRetry(imageId, MAX_ATTEMPTS, `Không xử lý được ảnh kết quả: ${errorText(e)}`, false);
    } else {
      finalizeFailures.set(imageId, n);
      // nhả khóa để lượt hỏi sau xử lý lại (không tạo tác vụ mới, không tốn thêm tiền)
      await db.generatedImage.updateMany({ where: { id: imageId, status: "PROCESSING" }, data: { lastPolledAt: null } });
    }
  }
}

/** Đẩy một phiên đi tiếp: gửi các ảnh đang chờ, hỏi các ảnh đang xử lý. */
export async function syncSession(sessionId: string): Promise<void> {
  const open = await db.generatedImage.findMany({
    where: { sessionId, status: { in: ["PENDING", "PROCESSING"] } },
  });
  await mapLimit(open, CONCURRENCY, (img) => (img.status === "PENDING" ? submitImage(img.id) : pollImage(img)));
}

/** Chạy ngay sau khi tạo phiên (qua after()), không giữ request mở. */
export async function kickSession(sessionId: string): Promise<void> {
  try {
    await syncSession(sessionId);
  } catch (e) {
    console.error(`kickSession ${sessionId} lỗi:`, errorText(e));
  }
}
