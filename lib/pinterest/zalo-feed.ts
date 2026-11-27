import "server-only";
import { db } from "@/lib/db";
import { getPinterestConfig } from "@/lib/env";
import { once, shared } from "@/lib/jobs/throttle";
import { getBotClient, NO_BOT_MESSAGE } from "@/lib/zalo";
import { ZaloError } from "@/lib/zalo/client";
import { getZaloSettings, type ZaloSettings } from "@/lib/zalo/settings";
import { isPinterestRateLimit } from "./client";
import { boardStamp, buildPinCaption, canAnnounce, CATCH_UP_MAX_MS } from "./feed";
import { queuePinsForZalo } from "./feed-queue";
import { fetchPinJpeg } from "./pin-image";
import { fetchBoards, importBoardPins, pinterestLock } from "./sync";

/**
 * Pin mới lưu vào board đang theo dõi → bot Zalo gửi ngay vào các nhóm bật "Nhận mẫu Pinterest" (docs/DECISIONS.md D127).
 *
 * Pinterest không có webhook báo "vừa lưu pin" (API v5 chỉ có webhook cho lead quảng cáo), nên máy chủ tự hỏi định kỳ.
 * Mỗi lần hỏi chỉ tốn MỘT lượt gọi: lấy danh sách board, so "dấu" của từng board đang theo dõi (số pin + mốc Pinterest
 * ghi lần cuối pin trong board thay đổi) với dấu đã lưu. Board nào đổi dấu mới tải danh sách pin của board đó, pin chưa có
 * trong CSDL là pin mới: xếp hàng (bảng pinterest_pin_deliveries) rồi gửi. Vòng này chạy ngay trong tiến trình máy chủ
 * (instrumentation.ts), không cần cron.
 */

const TICK_MS = 15_000; // nhịp của vòng: gửi các lượt đang chờ, và hỏi Pinterest khi đã tới hạn
const RATE_LIMIT_PAUSE_MS = 15 * 60_000;
/**
 * Board vừa đổi dấu thì các lần hỏi sau vẫn tải lại pin của nó thêm ngần này lần dù dấu không đổi nữa: phòng khi
 * Pinterest cập nhật dấu của board trước khi pin mới kịp hiện trong danh sách pin.
 */
const RECHECK_ROUNDS = 2;
const SEND_BATCH = 50;
const RETRY_DELAYS_MS = [3_000, 8_000]; // lỗi tạm thời của Zalo: thử lại tối đa 2 lần
/** Lỗi mà gửi tiếp vào cùng nhóm cũng sẽ lỗi y hệt: các lượt còn lại của nhóm đó trong đợt này báo lỗi luôn, khỏi gọi Zalo. */
const STOP_CODES = new Set([401, 410, 422, 429]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

type WatchState = {
  timer?: ReturnType<typeof setInterval>;
  busy: boolean;
  lastPollAt: number;
  /** Pinterest báo quá hạn mức: không hỏi nữa cho tới mốc này */
  pausedUntil: number;
  /** board vừa đổi dấu → số lần còn phải tải lại pin của nó */
  recheck: Map<string, number>;
  lastLog: string;
  lastLogAt: number;
};

// Trạng thái nằm trong bộ nhớ (hệ thống chạy một tiến trình duy nhất) và gắn vào globalThis để mọi nhóm mã của Next dùng chung.
const g = globalThis as unknown as { __pinFeedWatch?: WatchState };
function state(): WatchState {
  return (g.__pinFeedWatch ??= { busy: false, lastPollAt: 0, pausedUntil: 0, recheck: new Map(), lastLog: "", lastLogAt: 0 });
}

/* ---------- Hỏi Pinterest ---------- */

export type PollResult = { boards: number; changed: number; queued: number };

/** Một lần hỏi Pinterest: board đang theo dõi nào có pin mới thì nhập pin và xếp hàng gửi. Không ném lỗi (lỗi ghi vào tài khoản). */
export async function pollWatchedBoards(): Promise<PollResult> {
  const out: PollResult = { boards: 0, changed: 0, queued: 0 };
  const config = getPinterestConfig();
  if (!config) return out;
  const st = state();

  const owners = await db.pinterestBoard.findMany({ where: { zaloFeed: true }, distinct: ["accountId"], select: { accountId: true } });
  for (const { accountId } of owners) {
    const account = await db.pinterestAccount.findUnique({ where: { id: accountId } });
    if (!account) continue;
    try {
      await pinterestLock()(async () => {
        // đọc trong khóa: lượt đồng bộ vừa chạy xong có thể đã nhập pin và đổi dấu của board
        const watched = await db.pinterestBoard.findMany({
          where: { accountId, zaloFeed: true },
          select: { id: true, pinterestBoardId: true, pinsStamp: true, feedCheckedAt: true },
        });
        if (watched.length === 0) return;
        const onPinterest = new Map((await fetchBoards(account, config)).map((b) => [b.id, b]));

        const unchanged: string[] = [];
        for (const board of watched) {
          const api = onPinterest.get(board.pinterestBoardId);
          if (!api) continue; // board đã bị xóa trên Pinterest (hoặc token không còn xem được): để nguyên
          out.boards++;
          const changed = boardStamp(api) !== board.pinsStamp;
          const again = st.recheck.get(board.id) ?? 0;
          if (!changed && again <= 0) {
            unchanged.push(board.id);
            continue;
          }
          if (changed) {
            out.changed++;
            st.recheck.set(board.id, RECHECK_ROUNDS);
          } else if (again <= 1) st.recheck.delete(board.id);
          else st.recheck.set(board.id, again - 1);

          const r = await importBoardPins(account, config, board, api, { onlyNew: true });
          // việc theo dõi bị ngắt quãng (vừa bật lại, máy chủ nghỉ lâu) thì lần này chỉ nhập pin, không gửi
          if (canAnnounce(board.feedCheckedAt)) out.queued += await queuePinsForZalo(r.fresh);
        }
        if (unchanged.length > 0) await db.pinterestBoard.updateMany({ where: { id: { in: unchanged } }, data: { feedCheckedAt: new Date() } });
      });
      if (account.feedError) await db.pinterestAccount.update({ where: { id: accountId }, data: { feedError: null } });
    } catch (e) {
      let message = errText(e);
      if (isPinterestRateLimit(e)) {
        st.pausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
        message =
          "Pinterest báo đã gọi quá hạn mức API (mã 429), tạm nghỉ 15 phút rồi hỏi lại. Nếu hay gặp, tăng số giây giữa hai lần kiểm tra ở Cài đặt Zalo > Nhóm và gửi ảnh.";
      }
      await db.pinterestAccount.update({ where: { id: accountId }, data: { feedError: message } }).catch(() => {});
    }
  }
  return out;
}

/* ---------- Gửi vào nhóm ---------- */

export type DeliverSummary = { sent: number; failed: number };

function loadPending() {
  return db.pinterestPinDelivery.findMany({
    where: { status: "PENDING" },
    orderBy: [{ queuedAt: "asc" }, { id: "asc" }],
    take: SEND_BATCH,
    select: {
      id: true,
      pinId: true,
      groupId: true,
      pin: { select: { pinterestPinId: true, title: true, description: true, sourceImageUrl: true, board: { select: { name: true } } } },
      group: { select: { chatId: true, botId: true, isActive: true, pinFeed: true } },
    },
  });
}
type PendingRow = Awaited<ReturnType<typeof loadPending>>[number];

type SendContext = {
  settings: ZaloSettings;
  /** nhóm → lỗi sẽ lặp lại với mọi lượt gửi tiếp vào nhóm đó trong đợt này */
  stopped: Map<string, string>;
  /** mỗi pin chỉ tải ảnh một lần dù gửi vào nhiều nhóm */
  images: Map<string, Promise<Buffer>>;
};

async function sendOne(row: PendingRow, ctx: SendContext): Promise<"sent" | "failed" | "skipped"> {
  const fail = async (error: string) => {
    await db.pinterestPinDelivery.update({ where: { id: row.id }, data: { status: "FAILED", error: error.slice(0, 500) } });
    return "failed" as const;
  };

  if (!row.group.isActive || !row.group.pinFeed) return fail("Nhóm đã tắt hoặc không còn bật nhận mẫu Pinterest.");
  const blocked = ctx.stopped.get(row.groupId);
  if (blocked) return fail(blocked);
  const client = await getBotClient(row.group.botId);
  if (!client) {
    ctx.stopped.set(row.groupId, NO_BOT_MESSAGE);
    return fail(NO_BOT_MESSAGE);
  }

  let image: Buffer;
  try {
    let loading = ctx.images.get(row.pinId);
    if (!loading) ctx.images.set(row.pinId, (loading = fetchPinJpeg(row.pin.sourceImageUrl)));
    image = await loading;
  } catch (e) {
    return fail(errText(e));
  }
  const caption = buildPinCaption(
    { boardName: row.pin.board.name, title: row.pin.title, description: row.pin.description, pinterestPinId: row.pin.pinterestPinId },
    ctx.settings.pinFeedCaption,
  );

  // Hàng đợi gửi Zalo dùng chung toàn hệ thống: từng ảnh một, theo thứ tự đến.
  return shared().zaloSend(async () => {
    // tới lượt mới kiểm tra lại: trong lúc chờ, dòng này có thể đã bị hủy (tắt chức năng) hoặc đã được gửi
    const current = await db.pinterestPinDelivery.findUnique({ where: { id: row.id }, select: { status: true } });
    if (current?.status !== "PENDING") return "skipped" as const;

    let error: Error | undefined;
    let messageId: string | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await client.sendPhoto({ chatId: row.group.chatId, image, fileName: `pinterest-${row.pin.pinterestPinId}.jpg`, caption: caption || undefined });
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

    await db.pinterestPinDelivery.update({
      where: { id: row.id },
      data: error ? { status: "FAILED", error: errText(error) } : { status: "SENT", messageId: messageId ?? null, error: null, sentAt: new Date() },
    });
    await sleep(ctx.settings.sendGapMs);
    if (!error) return "sent" as const;
    if (error instanceof ZaloError && STOP_CODES.has(error.code)) ctx.stopped.set(row.groupId, errText(error));
    return "failed" as const;
  });
}

async function runDelivery(): Promise<DeliverSummary> {
  const sum: DeliverSummary = { sent: 0, failed: 0 };
  const settings = await getZaloSettings();
  if (!settings.enabled || !settings.pinFeed) return sum;

  // chờ quá lâu (bot hỏng, máy chủ nghỉ dài) thì bỏ: mẫu "mới" gửi trễ cả ngày không còn đúng ý nữa
  await db.pinterestPinDelivery.updateMany({
    where: { status: "PENDING", queuedAt: { lt: new Date(Date.now() - CATCH_UP_MAX_MS) } },
    data: { status: "FAILED", error: "Chờ quá 24 giờ chưa gửi được nên bỏ qua." },
  });

  const rows = await loadPending();
  const ctx: SendContext = { settings, stopped: new Map(), images: new Map() };
  for (const row of rows) {
    const r = await sendOne(row, ctx);
    if (r === "sent") sum.sent++;
    else if (r === "failed") sum.failed++;
  }
  return sum;
}

/**
 * Gửi các lượt đang chờ (tối đa 50 lượt mỗi đợt, theo thứ tự xếp hàng). Nhiều nơi gọi cùng lúc thì dùng chung một đợt,
 * nên không lượt nào bị gửi hai lần.
 */
export function deliverPendingPins(): Promise<DeliverSummary> {
  return once("pin-feed-deliver", runDelivery);
}

/* ---------- Vòng theo dõi ---------- */

function logProblem(e: unknown): void {
  const st = state();
  const text = errText(e);
  // cùng một lỗi (ví dụ CSDL đang tắt) thì 10 phút mới ghi lại một lần, không làm đầy log
  if (text === st.lastLog && Date.now() - st.lastLogAt < 10 * 60_000) return;
  st.lastLog = text;
  st.lastLogAt = Date.now();
  console.error("[pin-feed]", text);
}

async function tick(): Promise<void> {
  const st = state();
  if (st.busy) return;
  st.busy = true;
  try {
    const settings = await getZaloSettings();
    if (!settings.enabled || !settings.pinFeed) return;
    const now = Date.now();
    if (now >= st.pausedUntil && now - st.lastPollAt >= settings.pinFeedIntervalSec * 1000) {
      st.lastPollAt = now;
      await pollWatchedBoards();
    }
    await deliverPendingPins();
  } catch (e) {
    logProblem(e);
  } finally {
    st.busy = false;
  }
}

/** Bật vòng theo dõi (gọi một lần khi máy chủ khởi động; gọi lại không tạo thêm vòng thứ hai). */
export function startPinFeedWatcher(): void {
  const st = state();
  if (st.timer) return;
  st.timer = setInterval(() => void tick(), TICK_MS);
  st.timer.unref?.(); // không giữ tiến trình sống khi máy chủ đang tắt
}
