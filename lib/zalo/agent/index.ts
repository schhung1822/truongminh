import "server-only";
import type { ZaloContact } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/dal";
import { getChatProvider, type ChatProvider } from "@/lib/ai/chat";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { roleLabel } from "@/lib/roles";
import { getSettings } from "@/lib/settings";
import { getChatClient } from "../index";
import type { ZaloSettings } from "../settings";
import { logIssue } from "./issues";
import { runAssistantTurn } from "./loop";
import { stripTag } from "./parse";
import { sayToChat } from "./tasks";
import { loadThread, saveThread } from "./thread";
import { catalogImagesOf, lastCatalogTask, latestLogoMessage, type ToolCtx } from "./tools";

/**
 * Trợ lý Zalo của xưởng (docs/DECISIONS.md D129): nhân viên đã ghép nối (và gắn tài khoản web) tag bot trong nhóm Zalo, hoặc
 * nhắn riêng cho bot, bằng lời tự nhiên. AI đọc tin, tự chọn công cụ để tra khách, xem lịch sử, tạo ảnh, hỏi lại khi thiếu
 * thông tin (loop.ts, tools.ts); ảnh tạo xong được gửi lại đúng cuộc chat (tasks.ts).
 * Khách trong nhóm KHÔNG ra lệnh được: chỉ người đã ghép nối mới qua được cửa này.
 */

const AGENT_HELP = [
  "Em là trợ lý của xưởng, anh/chị tag em rồi nói việc cần làm bằng lời thường, ví dụ:",
  '• "Tạo ảnh cho khách Minh theo mẫu khách từng ưng": em xem lịch sử, đề xuất rồi làm khi anh/chị đồng ý.',
  '• Gửi logo kèm "làm catalog cho logo này, khách Anh Nam, thương hiệu Gió": em để AI chọn chất liệu hợp logo.',
  '• "Ảnh 2 số 3 và 5 làm móc khóa": thiết kế từ catalog vừa gửi (số theo số in trên ảnh).',
  '• "Khách Lascote từng làm gì?", "gửi lại mẫu lần trước", "xong chưa?", "còn bao nhiêu lượt?".',
  '• Hỏi kỹ thuật: "mẫu dày 0.3 mm khắc được không?".',
].join("\n");

export type AgentInput = {
  s: ZaloSettings;
  /** cuộc chat đang nhắn (nhóm hoặc chat riêng với bot) */
  chat: ZaloContact;
  isGroup: boolean;
  /** mã Zalo của người gửi (from.id) */
  senderId: string | undefined;
  kind: "TEXT" | "IMAGE" | "FILE" | "VOICE" | "STICKER" | "OTHER";
  text: string;
};

/**
 * Thử xử lý tin này như một lệnh. Trả về true nếu đã xử lý (kể cả khi từ chối hoặc im lặng), false nếu người gửi không phải
 * nhân viên đã ghép nối hoặc trợ lý đang tắt: khi đó luồng cũ (ghi nhận tin của khách...) chạy như trước.
 */
export async function handleAgentMessage(input: AgentInput): Promise<boolean> {
  const { s, chat, isGroup, senderId } = input;
  if (!s.agent || !senderId) return false;

  const staff = await db.zaloContact.findFirst({ where: { chatId: senderId, role: "STAFF", chatType: "PRIVATE" }, include: { user: true } });
  if (!staff) return false;

  if (input.kind !== "TEXT" && input.kind !== "IMAGE") return true; // sticker, tin thoại...: bỏ qua
  const stripped = stripTag(input.text, s.agentTagName);
  // trong nhóm chỉ tin có tag bot mới là lệnh; nhắn riêng cho bot thì không cần tag
  const tag = isGroup ? stripped : { mentioned: true, text: stripped.text };
  if (!tag.mentioned) return true;
  const say = (t: string, usage?: { promptTokens: number; completionTokens: number }) => sayToChat(chat.chatId, t, usage);

  // ảnh kèm tag nhưng không có lời dặn: chỉ ghi nhận logo
  if (input.kind === "IMAGE" && !tag.text) {
    await say('Em đã nhận ảnh này. Anh/chị nhắn tiếp việc cần làm (ví dụ "làm catalog cho logo này, khách Anh Nam, thương hiệu Gió") em sẽ dùng ảnh vừa gửi làm logo.');
    return true;
  }
  if (!tag.text) {
    await say(AGENT_HELP);
    return true;
  }

  const user = staff.user;
  if (!user || !user.isActive) {
    await say(
      `Tài khoản Zalo của ${staff.displayName} chưa được gắn với tài khoản trên web nên em chưa nhận lệnh được. Nhờ quản trị viên gắn ở Quản trị > Zalo > Nhân viên và lệnh.`,
    );
    return true;
  }
  const sessionUser: SessionUser = { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: false };

  try {
    await runForStaff({ ...input, text: tag.text.slice(0, 1500) }, staff, sessionUser, say);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Zalo agent: lỗi xử lý lệnh:", detail);
    await logIssue({ kind: "CRASH", chatId: chat.chatId, isGroup, staffName: user.name, command: tag.text, detail, model: s.chatModel });
    await say(`Em gặp lỗi khi xử lý lệnh này, anh/chị thử lại sau ít phút nhé.${agentErrorDetail(detail, { isAdmin: user.role === "ADMIN", isGroup })}`);
  }
  return true;
}

/**
 * Phần "Chi tiết (admin)" nối vào câu báo lỗi chung, để quản trị viên biết nguyên nhân mà không phải mở nhật ký máy chủ.
 * Chỉ hiện ở chat riêng của quản trị viên với bot: trong nhóm có khách, và nhân viên thường không cần thấy lỗi gốc.
 */
export function agentErrorDetail(detail: string, who: { isAdmin: boolean; isGroup: boolean }): string {
  if (!who.isAdmin || who.isGroup) return "";
  const short = detail.replace(/\s+/g, " ").trim().slice(0, 400);
  if (!short) return "";
  // bảng/cột chưa có = mã mới chạy trên CSDL chưa cập nhật cấu trúc (lỗi hay gặp nhất sau khi cập nhật thiếu bước)
  const stale = /does(?:n't| not) exist|unknown column/i.test(short);
  return `\nChi tiết (admin): ${short}${stale ? "\nCSDL trên máy chủ chưa được cập nhật cấu trúc: chạy lại bash deploy/update-pm2.sh (hoặc npx prisma migrate deploy)." : ""}`;
}

/**
 * Chạy một lượt trợ lý cho một tin của nhân viên: gom bối cảnh của cuộc chat, nạp trí nhớ của mạch, cho AI làm, rồi lưu lại
 * trí nhớ. `chatProvider` để kiểm thử thay AI thật bằng kịch bản soạn sẵn.
 */
export async function runForStaff(input: AgentInput, staff: ZaloContact, user: SessionUser, say: ToolCtx["say"], chatProvider: ChatProvider = getChatProvider()): Promise<void> {
  const { s, chat, isGroup } = input;
  const [sheets, lastCatalog, logoMsg, group, settings, thread] = await Promise.all([
    db.sheet.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { name: true } }),
    lastCatalogTask(chat.chatId),
    latestLogoMessage(chat.id),
    isGroup ? db.zaloGroup.findUnique({ where: { chatId: chat.chatId }, select: { name: true } }) : null,
    getSettings(),
    loadThread(chat.chatId, staff.id),
  ]);
  const catalogImages = lastCatalog ? await catalogImagesOf(lastCatalog.sessionId) : [];
  // tên nhóm do quản trị viên đặt (nhóm mới nhận ra có tên tạm "Nhóm mới (...)" thì coi như chưa đặt)
  const groupName = group && !/^Nhóm mới/.test(group.name) ? group.name.replace(/\s+/g, " ").trim().slice(0, 150) || null : null;

  const ctx: ToolCtx = { user, staff, chat, isGroup, settings: s, thread, groupName, logoMsg, lastCatalog, say };
  const client = isGroup ? null : await getChatClient(chat.chatId); // "đang soạn tin" chỉ có ở chat riêng
  try {
    await runAssistantTurn({
      chat: chatProvider,
      model: s.chatModel,
      ctx,
      text: input.text,
      facts: {
        workshopName: settings.workshopName,
        staffName: user.name,
        staffRole: roleLabel(user.role),
        groupName: isGroup ? (groupName ?? "(chưa đặt tên)") : null,
        hasRecentImage: !!logoMsg,
        lastCatalogImages: catalogImages.length,
        sheetNames: sheets.map((sh) => sh.name),
        now: new Intl.DateTimeFormat("vi-VN", { timeZone: getEnv().APP_TIMEZONE, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date()),
      },
      typing: client ? () => client.sendTyping(chat.chatId) : undefined,
    });
  } finally {
    // lưu cả khi lượt hỏng giữa chừng: việc đang chờ xác nhận và các mã tham chiếu đã cấp không được mất
    await saveThread(thread).catch((e) => console.error("Zalo agent: không lưu được trí nhớ của mạch:", e instanceof Error ? e.message : e));
  }
}
