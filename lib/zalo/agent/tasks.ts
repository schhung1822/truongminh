import "server-only";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { compareSessionImages } from "@/lib/jobs/order";
import { readAiState } from "@/lib/jobs/ai-state";
import { syncSession } from "@/lib/jobs/process";
import type { LayoutSnapshot } from "@/lib/jobs/snapshot";
import { shared } from "@/lib/jobs/throttle";
import { getStorage } from "@/lib/storage";
import { buildCaption, publicSessionUrl } from "../caption";
import { ZaloError } from "../client";
import { getChatClient } from "../index";
import { deliverImage } from "../send";
import { getZaloSettings, groupSendEnabled } from "../settings";
import { splitMessage, stripMarkdown } from "../text";
import { toJpeg } from "@/lib/imaging/webp";
import { logIssue } from "./issues";

/**
 * Giao kết quả của việc nhân viên giao cho bot: theo dõi phiên ảnh đã tạo, khi xong thì gửi ảnh lại đúng cuộc chat đã ra lệnh.
 * Việc theo dõi chạy trong tiến trình máy chủ; máy chủ khởi động lại thì `resumeBotTasks` (instrumentation.ts) nhặt lại các việc còn dang dở.
 */

const WATCH_INTERVAL_MS = 6_000;
const WATCH_MAX_MS = 25 * 60_000;
const RESUME_MAX_AGE_MS = 40 * 60_000;
const RETRY_DELAYS_MS = [3_000, 8_000];
const STOP_CODES = new Set([401, 410, 422, 429]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

const g = globalThis as unknown as { __zaloTaskWatching?: Set<string> };

/**
 * Gửi tin chữ vào một cuộc chat và lưu vào hội thoại (nếu cuộc chat đã có trong Hộp thư). Không bao giờ ném lỗi.
 * `usage`: số token AI đã dùng để ra được tin này, ghi vào đoạn đầu để trang thống kê Zalo cộng được.
 */
export async function sayToChat(chatId: string, text: string, usage?: { promptTokens: number; completionTokens: number }): Promise<boolean> {
  const client = await getChatClient(chatId);
  const contact = await db.zaloContact.findUnique({ where: { chatId }, select: { id: true, chatType: true, displayName: true } }).catch(() => null);
  // tin không tới được người ra lệnh: ghi vào nhật ký sự cố (D130), vì ngoài nhật ký máy chủ không còn dấu vết nào khác
  const lost = (why: string, unsent: string) =>
    logIssue({ kind: "SEND_FAILED", chatId, isGroup: contact?.chatType === "GROUP", staffName: contact?.chatType === "GROUP" ? null : contact?.displayName, detail: `${why} | Tin chưa gửi được: ${unsent.slice(0, 400)}` });
  if (!client) {
    await lost("Chưa kết nối bot Zalo hoặc bot của cuộc chat này đang tắt.", text);
    return false;
  }
  const chunks = splitMessage(stripMarkdown(text));
  for (const [i, chunk] of chunks.entries()) {
    let error: string | null = null;
    let zaloId: string | undefined;
    try {
      zaloId = (await client.sendMessage(chatId, chunk))?.message_id;
    } catch (e) {
      error = e instanceof ZaloError ? e.message : errText(e);
      console.error("Zalo agent: gửi tin lỗi:", error);
      await lost(error, chunk);
    }
    if (contact) {
      await db.zaloMessage
        .create({
          data: {
            contactId: contact.id,
            direction: "OUT",
            author: "BOT",
            kind: "TEXT",
            text: chunk,
            zaloMessageId: zaloId ?? null,
            failed: !!error,
            error,
            ...(i === 0 && usage && usage.promptTokens + usage.completionTokens > 0 ? { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens } : {}),
          },
        })
        .catch(() => {});
    }
    if (error) return false;
    await sleep(300);
  }
  return true;
}

/** Bắt đầu theo dõi một việc (chạy nền, không chờ). Một việc chỉ có một bộ theo dõi dù gọi nhiều lần. */
export function startTaskWatch(taskId: string): void {
  const set = (g.__zaloTaskWatching ??= new Set());
  if (set.has(taskId)) return;
  set.add(taskId);
  void watch(taskId)
    .catch((e) => console.error(`Zalo agent: theo dõi việc ${taskId} lỗi:`, errText(e)))
    .finally(() => set.delete(taskId));
}

async function watch(taskId: string): Promise<void> {
  const task = await db.zaloBotTask.findUnique({ where: { id: taskId } });
  if (!task || task.status !== "RUNNING") return;
  const deadline = task.createdAt.getTime() + WATCH_MAX_MS;

  let open = 0;
  for (;;) {
    try {
      await syncSession(task.sessionId); // gửi các ảnh đang chờ và hỏi kết quả các ảnh đang xử lý
    } catch (e) {
      console.error(`Zalo agent: syncSession ${task.sessionId} lỗi:`, errText(e));
    }
    open = await db.generatedImage.count({ where: { sessionId: task.sessionId, retries: { none: {} }, status: { in: ["PENDING", "PROCESSING"] } } });
    // Phiên do AI chọn chất liệu (D115, D125) chưa có ảnh nào trong lúc AI còn đọc logo: vẫn phải chờ, chưa phải "xong mà không có ảnh"
    const analysing = open === 0 && readAiState((await db.consultSession.findUnique({ where: { id: task.sessionId }, select: { aiAnalysis: true } }))?.aiAnalysis).kind === "analyzing";
    if ((open === 0 && !analysing) || Date.now() > deadline) break;
    await sleep(WATCH_INTERVAL_MS);
  }

  // chiếm quyền giao kết quả (tránh hai bộ theo dõi cùng gửi)
  const claimed = await db.zaloBotTask.updateMany({ where: { id: taskId, status: "RUNNING" }, data: { status: "DELIVERING" } });
  if (claimed.count === 0) return;
  await deliver(taskId, open);
}

type ImgRow = {
  id: string;
  finalPath: string | null;
  layoutSnapshot: unknown;
  materialId: string | null;
  variantIndex: number;
  createdAt: Date;
  sheet: { sortOrder: number } | null;
};

async function deliver(taskId: string, stillOpen: number): Promise<void> {
  const task = await db.zaloBotTask.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      user: { select: { name: true } },
      session: { include: { logo: { include: { brand: { include: { customer: true } } } } } },
    },
  });
  const finish = (status: "DONE" | "FAILED", summary: string | null, error: string | null) =>
    db.zaloBotTask.update({ where: { id: taskId }, data: { status, summary, error, finishedAt: new Date() } });

  const rows = (await db.generatedImage.findMany({
    where: { sessionId: task.sessionId, status: "SUCCESS", retries: { none: {} }, finalPath: { not: null } },
    select: { id: true, finalPath: true, layoutSnapshot: true, materialId: true, variantIndex: true, createdAt: true, sheet: { select: { sortOrder: true } } },
  })) as ImgRow[];
  rows.sort(compareSessionImages);
  const failedRows = await db.generatedImage.findMany({
    where: { sessionId: task.sessionId, status: "FAILED", retries: { none: {} } },
    select: { errorMessage: true },
  });

  const brand = task.session.logo.brand;
  const url = publicSessionUrl(getEnv().APP_URL, task.sessionId);
  const what = task.kind === "CATALOG" ? "catalog chất liệu" : "ảnh thiết kế";
  /** việc không ra ảnh, hoặc ảnh không tới được cuộc chat: ghi vào nhật ký sự cố của trợ lý (D130) */
  const failed = (detail: string) =>
    logIssue({ kind: "TASK_FAILED", chatId: task.chatId, isGroup: task.chatType === "GROUP", staffName: task.user.name, detail: `${detail}${url ? ` | Phiên: ${url}` : ""}` });

  if (rows.length === 0) {
    // phiên AI chọn chất liệu hỏng ngay từ bước phân tích thì không có ảnh nào: lấy lý do AI đã ghi vào phiên
    const ai = readAiState(task.session.aiAnalysis);
    const why = failedRows.find((f) => f.errorMessage)?.errorMessage ?? (ai.kind === "failed" ? ai.error : stillOpen > 0 ? "ảnh tạo quá lâu" : "không rõ lý do");
    await sayToChat(task.chatId, `Rất tiếc, ${what} của ${brand.name} chưa tạo được (${why.slice(0, 200)}). Nhờ ${task.user.name} mở web bấm "Tạo lại"${url ? `: ${url}` : "."}`);
    await finish("FAILED", null, why.slice(0, 500));
    await failed(`${what[0].toUpperCase()}${what.slice(1)} của ${brand.name} không ra ảnh nào: ${why}`);
    return;
  }

  const notes: string[] = [];
  if (failedRows.length > 0) notes.push(`${failedRows.length} ảnh bị lỗi`);
  if (stillOpen > 0) notes.push(`${stillOpen} ảnh chưa xong`);
  await sayToChat(
    task.chatId,
    `Xong rồi ạ. ${what[0].toUpperCase()}${what.slice(1)} của ${brand.name} (${brand.customer.name}): ${rows.length} ảnh${notes.length ? `, ${notes.join(", ")} (xem và tạo lại trên web)` : ""}. Em gửi ngay đây.`,
  );

  const settings = await getZaloSettings();
  const group = task.chatType === "GROUP" ? await db.zaloGroup.findUnique({ where: { chatId: task.chatId }, select: { id: true, chatId: true, botId: true } }) : null;
  const viaGroup = !!group && (await groupSendEnabled());
  const client = await getChatClient(task.chatId);

  let sent = 0;
  let lastError: string | null = null;
  for (const img of rows) {
    if (viaGroup && group) {
      // đi qua đường gửi nhóm chung: có ghi nhận, ảnh đã gửi vào nhóm này rồi thì bỏ qua, không gửi trùng
      const r = await deliverImage(img.id, group, { force: task.resend }); // "gửi lại ảnh": gửi cả ảnh đã từng vào nhóm này
      if (r.outcome === "failed") {
        lastError = r.error;
        if (r.stop) break;
      } else sent++;
      continue;
    }
    if (!client) {
      lastError = "Chưa kết nối bot Zalo hoặc bot của cuộc chat này đang tắt.";
      break;
    }
    const snap = img.layoutSnapshot as unknown as LayoutSnapshot;
    const label = snap.design ? `${snap.title} · ${snap.design.styleName}` : snap.imageNumber ? `Ảnh ${snap.imageNumber} · ${snap.title}` : snap.title;
    const caption = buildCaption({ brandName: brand.name, customerName: brand.customer.name, label, saleName: task.user.name, sessionUrl: url }, settings.captionTemplate);
    const r = await shared().zaloSend(async () => {
      let error: Error | undefined;
      try {
        const image = await toJpeg(await getStorage().get(img.finalPath!)); // ảnh lưu là WebP; gửi Zalo bằng JPEG
        for (let attempt = 0; ; attempt++) {
          try {
            await client.sendPhoto({ chatId: task.chatId, image, fileName: `${img.id}.jpg`, caption });
            error = undefined;
            break;
          } catch (e) {
            error = e instanceof Error ? e : new Error(String(e));
            if (!(e instanceof ZaloError && e.retryable) || attempt >= RETRY_DELAYS_MS.length) break;
            await sleep(RETRY_DELAYS_MS[attempt]);
          }
        }
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
      }
      await sleep(settings.sendGapMs);
      return error;
    });
    if (r) {
      lastError = errText(r);
      if (r instanceof ZaloError && STOP_CODES.has(r.code)) break;
    } else sent++;
  }

  if (task.kind === "CATALOG" && sent > 0) {
    await sayToChat(task.chatId, 'Muốn xem thiết kế, anh/chị tag em và nói theo số trên ảnh, ví dụ: "ảnh 1 số 3 và 5 làm móc khóa".');
  }
  if (sent < rows.length) await sayToChat(task.chatId, `Em gửi được ${sent}/${rows.length} ảnh${lastError ? ` (${lastError.slice(0, 200)})` : ""}.${url ? ` Xem đủ ảnh tại ${url}` : ""}`);
  await finish(sent > 0 ? "DONE" : "FAILED", `Gửi ${sent}/${rows.length} ảnh`, sent < rows.length ? lastError : null);
  if (sent < rows.length) await failed(`Chỉ gửi được ${sent}/${rows.length} ảnh của ${brand.name} vào cuộc chat: ${lastError ?? "không rõ lý do"}`);
}

/** Khi máy chủ khởi động: theo dõi tiếp các việc còn dang dở, việc quá cũ thì đóng lại. Không chờ, không ném lỗi. */
export async function resumeBotTasks(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RESUME_MAX_AGE_MS);
    await db.zaloBotTask.updateMany({
      where: { status: { in: ["RUNNING", "DELIVERING"] }, createdAt: { lt: cutoff } },
      data: { status: "FAILED", error: "Máy chủ khởi động lại khi việc đang chạy.", finishedAt: new Date() },
    });
    // đang gửi dở lúc máy chủ tắt: không biết đã gửi tới đâu, đóng lại để khỏi gửi trùng
    await db.zaloBotTask.updateMany({
      where: { status: "DELIVERING" },
      data: { status: "FAILED", error: "Máy chủ khởi động lại lúc đang gửi ảnh.", finishedAt: new Date() },
    });
    const running = await db.zaloBotTask.findMany({ where: { status: "RUNNING" }, select: { id: true } });
    for (const t of running) startTaskWatch(t.id);
  } catch (e) {
    console.error("Zalo agent: không nhặt lại được các việc dang dở:", errText(e));
  }
}
