import "server-only";
import { randomInt } from "node:crypto";
import { Prisma, type ZaloContact } from "@/generated/prisma/client";
import type { Role, ZaloBotAccess } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { isWeakPairCode, PAIR_CODE_LENGTH, PAIR_MAX_FAILS, pairLock } from "./pairing";

/**
 * Người dùng bot Zalo (docs/DECISIONS.md D133): mã ghép nối cá nhân của từng tài khoản web, ghép một tài khoản Zalo với tài
 * khoản web bằng mã đó, và dữ liệu cho trang Cài đặt Zalo > Nhân viên và quyền.
 */

function randomPairCode(): string {
  for (;;) {
    const code = String(randomInt(0, 10 ** PAIR_CODE_LENGTH)).padStart(PAIR_CODE_LENGTH, "0");
    if (!isWeakPairCode(code)) return code;
  }
}

/** Ghi một mã mới cho tài khoản; trùng mã với người khác (hiếm) thì bốc lại. */
async function writeNewCode(userId: string, onlyIfMissing: boolean): Promise<string | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomPairCode();
    try {
      const r = await db.user.updateMany({
        where: { id: userId, ...(onlyIfMissing ? { zaloPairCode: null } : {}) },
        data: { zaloPairCode: code, zaloPairCodeAt: new Date() },
      });
      if (r.count > 0) return code;
      // đã có mã (một lượt khác vừa tạo) hoặc không còn tài khoản này
      return (await db.user.findUnique({ where: { id: userId }, select: { zaloPairCode: true } }))?.zaloPairCode ?? null;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return null;
}

/**
 * Mã ghép nối của một tài khoản, tạo nếu chưa có. Gọi được lúc dựng trang: việc tạo chỉ xảy ra một lần cho mỗi tài khoản và
 * chạy lại bao nhiêu lần cũng ra cùng kết quả.
 */
export async function ensurePairCode(userId: string): Promise<string | null> {
  const row = await db.user.findUnique({ where: { id: userId }, select: { zaloPairCode: true } });
  if (!row) return null;
  return row.zaloPairCode ?? writeNewCode(userId, true);
}

/** Đổi mã: mã cũ hết hiệu lực ngay. Các tài khoản Zalo đã ghép nối vẫn giữ nguyên. */
export function regeneratePairCode(userId: string): Promise<string | null> {
  return writeNewCode(userId, false);
}

export type PairingContact = Pick<ZaloContact, "id" | "role" | "userId" | "pairFailCount" | "pairFailAt">;

export type PairOutcome =
  /** `already` = Zalo này vốn đã ghép với đúng tài khoản đó */
  | { kind: "paired"; user: { id: string; name: string; role: Role }; already: boolean }
  /** mã đúng nhưng tài khoản đang ở quyền "Không dùng bot" */
  | { kind: "denied"; user: { id: string; name: string } }
  | { kind: "wrong"; left: number }
  /** `first` = vừa chạm giới hạn ở lần này (báo một câu); các lần sau trong lúc bị chặn thì im */
  | { kind: "locked"; first: boolean };

/**
 * Ghép một tài khoản Zalo (hội thoại riêng với bot) với tài khoản web có mã `code`. Mã của tài khoản đã khóa coi như mã sai.
 * Sai PAIR_MAX_FAILS lần thì hội thoại bị tạm chặn (lib/zalo/pairing.ts).
 */
export async function pairWithCode(contact: PairingContact, code: string | null, now = new Date()): Promise<PairOutcome> {
  const lock = pairLock(contact.pairFailCount, contact.pairFailAt, now);
  if (lock.locked) return { kind: "locked", first: false };

  // `code` trống = người đó gõ sai dạng mã: cũng tính một lần sai, để không ai bắt bot trả lời mãi được
  const user = code ? await db.user.findFirst({ where: { zaloPairCode: code, isActive: true }, select: { id: true, name: true, role: true, zaloBotAccess: true } }) : null;
  if (!user) {
    const fails = lock.fails + 1;
    await db.zaloContact.update({ where: { id: contact.id }, data: { pairFailCount: fails, pairFailAt: now } });
    return fails >= PAIR_MAX_FAILS ? { kind: "locked", first: true } : { kind: "wrong", left: PAIR_MAX_FAILS - fails };
  }
  if (user.zaloBotAccess === "NONE") return { kind: "denied", user };

  const already = contact.role === "STAFF" && contact.userId === user.id;
  await db.zaloContact.update({
    where: { id: contact.id },
    data: {
      role: "STAFF",
      userId: user.id,
      pairCode: null,
      pairRequestedAt: null,
      pairFailCount: 0,
      pairFailAt: null,
      ...(already ? {} : { pairedAt: now }),
      needsHuman: false,
      botPaused: false,
      botPausedAt: null,
    },
  });
  return { kind: "paired", user, already };
}

/* ---------- Dữ liệu cho trang quản trị ---------- */

export type PairedZalo = {
  contactId: string;
  zaloName: string;
  /** tên bot mà tài khoản Zalo này đang nhắn (bot nhận tin gần nhất) */
  botName: string;
  botActive: boolean;
  pairedAt: Date | null;
  /** lần gần nhất người này ra lệnh cho trợ lý (ở bất kỳ cuộc chat nào) */
  lastCommandAt: Date | null;
};

export type BotUserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  access: ZaloBotAccess;
  /** null khi quyền là "Không dùng bot" (không cấp mã cho người không được dùng) */
  code: string | null;
  zalo: PairedZalo[];
};

/** Tên hiện cho bot đặt trong .env, và cho hội thoại không còn gắn bot nào (bot đã gỡ). */
function unboundBotName(): { name: string; active: boolean } {
  return getEnv().ZALO_BOT_TOKEN ? { name: "Bot trong file .env", active: true } : { name: "Bot đã gỡ", active: false };
}

/** Các tài khoản Zalo đã ghép nối (nhân viên), kèm bot và lần ra lệnh gần nhất. */
async function loadPairedZalo(where: Prisma.ZaloContactWhereInput): Promise<(PairedZalo & { userId: string | null })[]> {
  const contacts = await db.zaloContact.findMany({
    where: { role: "STAFF", chatType: "PRIVATE", accountId: null, ...where },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, userId: true, pairedAt: true, botId: true, bot: { select: { name: true, isActive: true } } },
  });
  if (contacts.length === 0) return [];
  const last = await db.zaloAssistantThread.groupBy({ by: ["staffId"], where: { staffId: { in: contacts.map((c) => c.id) } }, _max: { updatedAt: true } });
  const lastAt = new Map(last.map((r) => [r.staffId, r._max.updatedAt]));
  const unbound = unboundBotName();
  return contacts.map((c) => ({
    contactId: c.id,
    userId: c.userId,
    zaloName: c.displayName,
    botName: c.bot?.name ?? unbound.name,
    botActive: c.bot ? c.bot.isActive : unbound.active,
    pairedAt: c.pairedAt,
    lastCommandAt: lastAt.get(c.id) ?? null,
  }));
}

/**
 * Mọi tài khoản web đang hoạt động kèm quyền dùng bot, mã ghép nối và các tài khoản Zalo đã ghép. Tài khoản được dùng bot mà
 * chưa có mã thì được cấp mã ngay ở đây, để quản trị viên mở trang là có mã gửi cho nhân viên.
 */
export async function loadBotUsers(): Promise<{ users: BotUserRow[]; unlinked: PairedZalo[] }> {
  const [users, paired] = await Promise.all([
    db.user.findMany({
      where: { isActive: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true, zaloBotAccess: true, zaloPairCode: true },
    }),
    loadPairedZalo({}),
  ]);
  const rows: BotUserRow[] = [];
  for (const u of users) {
    const code = u.zaloBotAccess === "NONE" ? null : (u.zaloPairCode ?? (await writeNewCode(u.id, true)));
    rows.push({ id: u.id, name: u.name, email: u.email, role: u.role, access: u.zaloBotAccess, code, zalo: paired.filter((p) => p.userId === u.id) });
  }
  const active = new Set(users.map((u) => u.id));
  // Zalo đã ghép nối kiểu cũ mà chưa gắn tài khoản web, hoặc gắn với tài khoản đã khóa
  return { users: rows, unlinked: paired.filter((p) => !p.userId || !active.has(p.userId)) };
}

/** Phần "Dùng hệ thống qua Zalo" trên trang Tài khoản của tôi. */
export async function loadMyZalo(userId: string): Promise<{ access: ZaloBotAccess; code: string | null; zalo: PairedZalo[]; botNames: string[] } | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { zaloBotAccess: true } });
  if (!user) return null;
  const [code, zalo, botNames] = await Promise.all([user.zaloBotAccess === "NONE" ? null : ensurePairCode(userId), loadPairedZalo({ userId }), activeBotNames()]);
  return { access: user.zaloBotAccess, code, zalo, botNames };
}

/** Tên (do quản trị viên đặt) của các bot đang bật, để chỉ cho nhân viên biết cần nhắn bot nào. */
export async function activeBotNames(): Promise<string[]> {
  const bots = await db.zaloBot.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { name: true } });
  return bots.map((b) => b.name);
}
