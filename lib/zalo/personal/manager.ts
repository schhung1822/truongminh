import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { CloseReason, LoginQRCallbackEventType, Zalo, type API, type Credentials } from "zca-js";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { ingestPersonalMessage } from "./ingest";

/**
 * Quản lý các tài khoản Zalo CÁ NHÂN (đăng nhập QR bằng thư viện không chính thức zca-js).
 * - Mỗi tài khoản giữ một kết nối nghe tin riêng trong tiến trình máy chủ; tin đến được lưu vào Hộp thư chung.
 * - Cookie đăng nhập lưu mã hóa trong CSDL; máy chủ khởi động lại thì tự đăng nhập lại bằng cookie (không cần quét QR).
 * - Chỉ một kết nối nghe tin cho mỗi tài khoản: mở Zalo Web cùng tài khoản sẽ làm kết nối này bị ngắt (có nút kết nối lại).
 * Trạng thái nằm trên globalThis để không mất khi Next nạp lại module lúc phát triển.
 *
 * LƯU Ý: thư viện này mô phỏng trình duyệt Zalo Web, không phải API chính thức; dùng cho thử nghiệm, có nguy cơ tài khoản bị khóa.
 */

type Live = { api: API; stopped: boolean };

export type LoginStatus = "STARTING" | "QR" | "SCANNED" | "SUCCESS" | "FAILED" | "EXPIRED";
export type LoginState = {
  id: string;
  status: LoginStatus;
  /** ảnh QR dạng data URL */
  qr: string | null;
  scannedName: string | null;
  error: string | null;
  accountId: string | null;
  createdAt: number;
  abort: (() => unknown) | null;
  qrRetries: number;
};

type Store = { live: Map<string, Live>; logins: Map<string, LoginState>; started: boolean };
const g = globalThis as unknown as { __zaloPersonal?: Store };
const store = (): Store => (g.__zaloPersonal ??= { live: new Map(), logins: new Map(), started: false });

const LOGIN_TIMEOUT_MS = 4 * 60_000;
const MAX_QR_RETRIES = 3;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

async function imageMetadataGetter(filePath: string) {
  const { readFile } = await import("node:fs/promises");
  const data = await readFile(filePath);
  const m = await sharp(data).metadata();
  return { height: m.height ?? 0, width: m.width ?? 0, size: m.size ?? data.length };
}

function newZalo(): Zalo {
  // selfListen: nhận cả tin chính chủ gõ trên điện thoại/máy khác, để hội thoại trên web đầy đủ
  return new Zalo({ selfListen: true, checkUpdate: false, logging: false, imageMetadataGetter });
}

async function setStatus(accountId: string, status: "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "LOGGED_OUT", lastError: string | null = null) {
  await db.zaloAccount
    .update({
      where: { id: accountId },
      data: { status, lastError, ...(status === "CONNECTED" ? { lastConnectedAt: new Date() } : {}) },
    })
    .catch(() => {});
}

/** Gắn bộ nghe tin vào một phiên đăng nhập đã thành công và bắt đầu nghe. */
function attach(accountId: string, api: API) {
  const s = store();
  const old = s.live.get(accountId);
  if (old) {
    old.stopped = true;
    try {
      old.api.listener.stop();
    } catch {
      /* đã dừng */
    }
  }
  const live: Live = { api, stopped: false };
  s.live.set(accountId, live);

  const listener = api.listener;
  listener.on("connected", () => void setStatus(accountId, "CONNECTED"));
  listener.on("message", (m) => {
    void ingestPersonalMessage(accountId, api, m).catch((e) => console.error(`Zalo cá nhân ${accountId}: lỗi lưu tin:`, errText(e)));
  });
  listener.on("error", (e) => console.error(`Zalo cá nhân ${accountId}: lỗi kết nối:`, errText(e)));
  listener.on("closed", (code, reason) => {
    if (live.stopped) return; // do mình chủ động ngắt hoặc thay bằng kết nối mới
    if (s.live.get(accountId) === live) s.live.delete(accountId);
    const why =
      code === CloseReason.DuplicateConnection
        ? "Tài khoản đang được mở ở nơi khác (Zalo Web hoặc thiết bị khác) nên kết nối bị ngắt."
        : code === CloseReason.KickConnection
          ? "Zalo đã ngắt kết nối này (có thể bạn đăng xuất từ điện thoại)."
          : `Kết nối bị ngắt (mã ${code}${reason ? `, ${reason}` : ""}).`;
    void setStatus(accountId, code === CloseReason.KickConnection ? "LOGGED_OUT" : "DISCONNECTED", why);
  });
  listener.start({ retryOnClose: true });
  void setStatus(accountId, "CONNECTING");
}

/** Kết nối (hoặc kết nối lại) một tài khoản bằng cookie đã lưu. */
export async function connectAccount(accountId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const account = await db.zaloAccount.findUnique({ where: { id: accountId } });
  if (!account) return { ok: false, error: "Không tìm thấy tài khoản." };
  if (!account.credentials) return { ok: false, error: "Tài khoản chưa có thông tin đăng nhập, hãy quét QR lại." };
  let creds: Credentials;
  try {
    creds = JSON.parse(decryptSecret(account.credentials)) as Credentials;
  } catch (e) {
    await setStatus(accountId, "LOGGED_OUT", errText(e));
    return { ok: false, error: errText(e) };
  }
  await setStatus(accountId, "CONNECTING");
  try {
    const api = await newZalo().login(creds);
    attach(accountId, api);
    return { ok: true };
  } catch (e) {
    const msg = `Đăng nhập lại không được: ${errText(e)}. Có thể phiên đã hết hạn, hãy quét QR lại.`;
    await setStatus(accountId, "LOGGED_OUT", msg);
    return { ok: false, error: msg };
  }
}

/** Ngắt kết nối nghe tin (giữ tài khoản và cookie để kết nối lại sau). */
export async function disconnectAccount(accountId: string): Promise<void> {
  const s = store();
  const live = s.live.get(accountId);
  if (live) {
    live.stopped = true;
    try {
      live.api.listener.stop();
    } catch {
      /* đã dừng */
    }
    s.live.delete(accountId);
  }
  await setStatus(accountId, "DISCONNECTED", null);
}

export function getAccountApi(accountId: string): API | null {
  return store().live.get(accountId)?.api ?? null;
}

export function isAccountLive(accountId: string): boolean {
  return store().live.has(accountId);
}

/** Gọi một lần khi máy chủ khởi động: tự kết nối lại mọi tài khoản bật "tự kết nối". */
export async function startAllPersonalAccounts(): Promise<void> {
  const s = store();
  if (s.started) return;
  s.started = true;
  try {
    const accounts = await db.zaloAccount.findMany({ where: { autoConnect: true, credentials: { not: null } }, select: { id: true, name: true } });
    // các tài khoản không tự kết nối: chắc chắn đang ngắt
    await db.zaloAccount.updateMany({ where: { OR: [{ autoConnect: false }, { credentials: null }] }, data: { status: "DISCONNECTED" } });
    for (const a of accounts) {
      const r = await connectAccount(a.id);
      console.log(r.ok ? `Zalo cá nhân: đã kết nối "${a.name}".` : `Zalo cá nhân: "${a.name}" chưa kết nối được: ${r.error}`);
      await new Promise((r2) => setTimeout(r2, 800)); // nối lần lượt, tránh dồn dập
    }
  } catch (e) {
    s.started = false;
    console.error("Zalo cá nhân: không khởi động được các tài khoản:", errText(e));
  }
}

/* ---------- Đăng nhập bằng QR ---------- */

export type LoginView = Pick<LoginState, "id" | "status" | "qr" | "scannedName" | "error" | "accountId">;

export function getLogin(id: string): LoginView | null {
  const l = store().logins.get(id);
  return l ? { id: l.id, status: l.status, qr: l.qr, scannedName: l.scannedName, error: l.error, accountId: l.accountId } : null;
}

export function abortLogin(id: string): void {
  const l = store().logins.get(id);
  if (!l) return;
  try {
    l.abort?.();
  } catch {
    /* đã kết thúc */
  }
  if (l.status === "STARTING" || l.status === "QR" || l.status === "SCANNED") {
    l.status = "FAILED";
    l.error = "Đã hủy.";
    l.qr = null;
  }
}

/** Bắt đầu một lượt đăng nhập QR. Trả về mã để giao diện hỏi trạng thái và lấy ảnh QR. */
export function startQrLogin(): string {
  const s = store();
  // dọn các lượt cũ
  for (const [id, l] of s.logins) if (Date.now() - l.createdAt > 15 * 60_000) s.logins.delete(id);

  const state: LoginState = { id: randomUUID(), status: "STARTING", qr: null, scannedName: null, error: null, accountId: null, createdAt: Date.now(), abort: null, qrRetries: 0 };
  s.logins.set(state.id, state);

  const timeout = setTimeout(() => abortLogin(state.id), LOGIN_TIMEOUT_MS);
  let creds: Credentials | null = null;

  newZalo()
    .loginQR({}, (ev) => {
      switch (ev.type) {
        case LoginQRCallbackEventType.QRCodeGenerated:
          state.status = "QR";
          state.qr = `data:image/png;base64,${ev.data.image}`;
          state.abort = ev.actions.abort;
          break;
        case LoginQRCallbackEventType.QRCodeScanned:
          state.status = "SCANNED";
          state.scannedName = ev.data.display_name;
          state.abort = ev.actions.abort;
          break;
        case LoginQRCallbackEventType.QRCodeExpired:
          if (state.qrRetries < MAX_QR_RETRIES) {
            state.qrRetries++;
            state.status = "STARTING";
            ev.actions.retry();
          } else {
            state.status = "EXPIRED";
            state.error = "Mã QR đã hết hạn.";
            ev.actions.abort();
          }
          break;
        case LoginQRCallbackEventType.QRCodeDeclined:
          state.status = "FAILED";
          state.error = "Đã từ chối đăng nhập trên điện thoại.";
          ev.actions.abort();
          break;
        case LoginQRCallbackEventType.GotLoginInfo:
          creds = { cookie: ev.data.cookie, imei: ev.data.imei, userAgent: ev.data.userAgent };
          break;
      }
    })
    .then(async (api) => {
      if (!creds) throw new Error("Zalo không trả thông tin đăng nhập.");
      const profile = (await api.fetchAccountInfo()).profile;
      const uid = api.getOwnId();
      const data = {
        name: (profile.displayName || profile.zaloName || `Zalo ${uid.slice(-6)}`).slice(0, 150),
        phone: profile.phoneNumber ? String(profile.phoneNumber).slice(0, 30) : null,
        avatarUrl: profile.avatar ? String(profile.avatar).slice(0, 500) : null,
        credentials: encryptSecret(JSON.stringify(creds)),
        lastError: null,
        autoConnect: true,
      };
      const account = await db.zaloAccount.upsert({ where: { uid }, create: { uid, ...data }, update: data });
      attach(account.id, api);
      state.status = "SUCCESS";
      state.accountId = account.id;
      state.qr = null;
    })
    .catch((e) => {
      if (state.status !== "FAILED" && state.status !== "EXPIRED") {
        state.status = "FAILED";
        state.error = state.error ?? errText(e);
      }
      state.qr = null;
    })
    .finally(() => clearTimeout(timeout));

  return state.id;
}
