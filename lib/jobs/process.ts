import "server-only";
import type { GeneratedImage } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getProvider } from "@/lib/providers";
import { ProviderFatalError, ProviderRateLimitError } from "@/lib/providers/types";
import { toWebp } from "@/lib/imaging/webp";
import { getStorage } from "@/lib/storage";
import { mockupKey } from "@/lib/storage/keys";
import { mapLimit } from "./async";
import { renderFinal } from "./finish";
import { ensurePinterestPinUrl, PinterestReferenceError } from "./pinterest-reference";
import { ensureLogoUrl, ensureMaterialUrl, NoReferenceError } from "./references";
import { getStyleRefPinIds, MAX_ATTEMPTS, type LayoutSnapshot } from "./snapshot";
import { MAX_REFERENCE_IMAGES } from "@/lib/image-options";
import {
  ACTIVE_CAP_WAIT_MS,
  MAX_ACTIVE_TASKS,
  clearDeferred,
  noteDeferred,
  noteRateLimited,
  reserveSubmitSlot,
  shared,
} from "./throttle";

const POLL_INTERVAL_MS = 5_000; // mỗi tác vụ tối đa 1 lần hỏi trạng thái / 5 giây, dù có nhiều người cùng xem (ảnh mất 1-3 phút nên đủ mịn)
const SUBMIT_LOCK_MS = 90_000;
const FINALIZE_LOCK_MS = 180_000;
const PROCESSING_TIMEOUT_MS = 15 * 60_000;
const MAX_FINALIZE_FAILURES = 3;
const CONCURRENCY = 4;
const KICK_INTERVAL_MS = 4_000;
const KICK_MAX_MS = 12 * 60_000; // hơi dài hơn thời gian hoãn tối đa của một ảnh (MAX_DEFER_MS)

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
  clearDeferred(shared().throttle, id);
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

/** Nhích thêm 0-1,5 giây để nhiều ảnh cùng bị hoãn không đồng loạt thức dậy một lúc. */
function jitter(): number {
  return Math.floor(Math.random() * 1_500);
}

/**
 * Ảnh chưa tới lượt gửi (hệ thống đang giữ nhịp, hoặc bị kie.ai báo 429): giữ nguyên PENDING, hẹn giờ gửi lại.
 * KHÔNG tăng số lần thử và không tính hạn mức. Hoãn tổng cộng quá lâu thì báo lỗi để sale bấm Tạo lại.
 */
async function deferImage(id: string, waitMs: number, reason: string) {
  if (noteDeferred(shared().throttle, id)) {
    await failOrRetry(id, MAX_ATTEMPTS, `${reason} Đã chờ quá lâu, vui lòng bấm Tạo lại.`, false);
    return;
  }
  await db.generatedImage.updateMany({
    where: { id, status: "PENDING" },
    data: { lastPolledAt: new Date(Date.now() + waitMs + jitter()) },
  });
}

/**
 * Cổng giữ nhịp trước khi gửi sang kie.ai (chỉ áp dụng khi dùng kie): đủ số tác vụ đang chạy và còn suất gửi trong
 * cửa sổ 10 giây. Trả số ms phải chờ, 0 = được gửi ngay.
 */
async function submitGate(): Promise<number> {
  const active = await db.generatedImage.count({ where: { status: "PROCESSING" } });
  if (active >= MAX_ACTIVE_TASKS) return ACTIVE_CAP_WAIT_MS;
  return reserveSubmitSlot(shared().throttle);
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

  if (getProvider().name === "kie") {
    const wait = await submitGate();
    if (wait > 0) {
      await deferImage(imageId, wait, "Hệ thống đang đông, ảnh đang xếp hàng.");
      return;
    }
  }

  try {
    const snapshot = img.layoutSnapshot as unknown as LayoutSnapshot;
    const pinterestPinIds = img.kind === "DESIGN" ? getStyleRefPinIds(snapshot) : [];
    if (1 + snapshot.cells.length + pinterestPinIds.length > MAX_REFERENCE_IMAGES) {
      throw new NoReferenceError(`(quá giới hạn ${MAX_REFERENCE_IMAGES} ảnh tham chiếu)`);
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

    // Ảnh thiết kế có chọn (các) ảnh phong cách tham khảo (Pinterest): thêm làm ảnh tham chiếu cuối cùng, đúng thứ
    // tự đã chọn. Không được âm thầm bỏ qua vì prompt đang trỏ đúng tới các ảnh này; thiếu ảnh thì kết quả sẽ sai
    // phong cách đã chọn.
    let styleRefUrls: string[] = [];
    if (pinterestPinIds.length > 0) {
      const pins = await db.pinterestPin.findMany({ where: { id: { in: pinterestPinIds } } });
      if (pins.length !== pinterestPinIds.length) {
        throw new PinterestReferenceError("Một ảnh phong cách Pinterest đã chọn không còn trong thư viện. Hãy chọn lại ảnh rồi tạo thiết kế mới.");
      }
      const pinById = new Map(pins.map((p) => [p.id, p]));
      styleRefUrls = await Promise.all(pinterestPinIds.map((id) => ensurePinterestPinUrl(pinById.get(id)!)));
    }

    const { taskId } = await getProvider().createTask({
      model: img.model,
      prompt: img.promptUsed,
      inputUrls: [logoUrl, ...materialUrls, ...styleRefUrls], // ảnh 1 là logo, sau đó theo đúng thứ tự ô, cuối cùng (các) ảnh phong cách tham khảo nếu có
      aspectRatio: img.aspectRatio,
      resolution: img.resolution,
      callbackUrl: callbackUrl(),
    });
    await db.generatedImage.updateMany({
      where: { id: imageId, status: "PENDING" },
      data: { status: "PROCESSING", taskId, lastPolledAt: null },
    });
    clearDeferred(shared().throttle, imageId);
  } catch (e) {
    if (e instanceof ProviderRateLimitError) {
      // kie.ai báo gửi quá nhanh: cả hệ thống nghỉ một lúc, ảnh này chờ lâu dần rồi gửi lại (không tính lần thử lại)
      const wait = noteRateLimited(shared().throttle, imageId);
      console.warn(`submitImage ${imageId}: kie.ai báo 429, hẹn gửi lại sau ${Math.round(wait / 1000)}s`);
      await deferImage(imageId, wait, errorText(e));
      return;
    }
    console.error(`submitImage ${imageId} lỗi:`, errorText(e));
    const retryable = !(e instanceof NoReferenceError || e instanceof PinterestReferenceError || e instanceof ProviderFatalError);
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
  // xử lý ảnh bằng sharp tốn RAM/CPU: toàn hệ thống chỉ làm vài ảnh cùng lúc, còn lại xếp hàng
  await shared().finalizeLimit(() => finalizeImage(img.id, info.resultUrl ?? "", info.credits));
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
    const { buffer } = await provider.downloadResult(resultUrl);
    const storage = getStorage();
    // Tải ảnh về, nén WebP rồi lưu lên kho (không lưu link của nhà cung cấp vì sẽ hết hạn); CSDL chỉ lưu key.
    const brandId = img.session.logo.brandId;
    const originalKey = mockupKey(brandId);
    await storage.put(originalKey, await toWebp(buffer), { contentType: "image/webp" }); // giữ ảnh gốc ngay: link của nhà cung cấp sẽ hết hạn

    const final = await renderFinal(img, img.session.logo.brand.name, buffer); // vẽ từ ảnh gốc chưa nén, đã ra WebP
    const finalKey = mockupKey(brandId);
    await storage.put(finalKey, final, { contentType: "image/webp" });

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

/**
 * Chạy ngay sau khi tạo phiên (qua after()), không giữ request mở.
 * Nếu còn ảnh đang xếp hàng chờ tới lượt gửi (hệ thống giữ nhịp, xem throttle.ts) thì tiếp tục đẩy tới khi gửi hết
 * hoặc hết KICK_MAX_MS, để ảnh vẫn được gửi dù sale đã đóng trang. Sau khi đã gửi hết, việc hỏi kết quả do màn hình
 * kết quả (hoặc callback) lo như cũ.
 */
export async function kickSession(sessionId: string): Promise<void> {
  try {
    const deadline = Date.now() + KICK_MAX_MS;
    for (;;) {
      await syncSession(sessionId);
      const waiting = await db.generatedImage.count({ where: { sessionId, status: "PENDING" } });
      if (waiting === 0 || Date.now() > deadline) break;
      await new Promise((resolve) => setTimeout(resolve, KICK_INTERVAL_MS));
    }
  } catch (e) {
    console.error(`kickSession ${sessionId} lỗi:`, errorText(e));
  }
}
