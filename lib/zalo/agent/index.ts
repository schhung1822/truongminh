import "server-only";
import type { ZaloContact } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/dal";
import { ChatError, getChatProvider, text as textPart } from "@/lib/ai/chat";
import { db } from "@/lib/db";
import { createCatalogSession } from "@/lib/jobs/create";
import { createDesignSession } from "@/lib/jobs/design";
import type { LayoutSnapshot } from "@/lib/jobs/snapshot";
import { compareSessionImages } from "@/lib/jobs/order";
import { createLogoFromBuffer, LogoError } from "@/lib/logos/create";
import { canEditCustomer } from "@/lib/permissions";
import { getStorage } from "@/lib/storage";
import { answerWithKnowledge } from "@/lib/knowledge";
import type { ZaloSettings } from "../settings";
import { fold, preview } from "../text";
import {
  buildIntentPrompt,
  parseIntent,
  resolvePicks,
  stripTag,
  type AgentIntent,
  type CatalogImageCells,
} from "./parse";
import { sayToChat, startTaskWatch } from "./tasks";

/**
 * Trợ lý nhận lệnh: nhân viên đã ghép nối (và gắn tài khoản web) tag bot trong nhóm Zalo, hoặc nhắn riêng cho bot, để
 *  - làm catalog chất liệu cho logo vừa gửi,
 *  - chọn vài chất liệu trên catalog để làm ảnh thiết kế,
 *  - hỏi kỹ thuật (bot trả lời dựa trên thông tin xưởng và danh sách chất liệu).
 * Ảnh tạo xong được gửi lại đúng cuộc chat (xem tasks.ts). Khách trong nhóm KHÔNG ra lệnh được: chỉ người đã ghép nối mới qua được cửa này.
 */

const LOGO_MAX_AGE_MS = 24 * 3600_000;
const AGENT_HELP = [
  "Em làm được các việc sau, anh/chị tag em kèm lệnh nhé:",
  '• Làm catalog: gửi logo của khách kèm tin "làm mẫu chất liệu cho logo này" (logo gửi trong 24 giờ gần nhất em đều nhớ).',
  '• Xem thiết kế: "ảnh 2 số 3 và 5 làm móc khóa" (số theo số in trên ảnh catalog, thêm "2 phương án" nếu muốn).',
  '• Hỏi kỹ thuật: ví dụ "mẫu dày 0.3 mm khắc được không?".',
  '• Hỏi tiến độ: "xong chưa?".',
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
 * nhân viên đã ghép nối hoặc trợ lý đang tắt: khi đó luồng cũ (bot AI trả lời khách...) chạy như trước.
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
  const say = (t: string) => sayToChat(chat.chatId, t);

  // ảnh kèm tag nhưng không có lời dặn: chỉ ghi nhận logo
  if (input.kind === "IMAGE" && !tag.text) {
    await say("Em đã nhận ảnh này. Anh/chị nhắn tiếp lệnh (ví dụ \"làm mẫu chất liệu cho logo này\") em sẽ dùng ảnh vừa gửi làm logo.");
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
  const sessionUser: SessionUser = { id: user.id, email: user.email, name: user.name, role: user.role };

  try {
    await run({ ...input, text: tag.text }, staff, sessionUser, say);
  } catch (e) {
    console.error("Zalo agent: lỗi xử lý lệnh:", e instanceof Error ? e.message : e);
    await say("Em gặp lỗi khi xử lý lệnh này, anh/chị thử lại sau ít phút nhé.");
  }
  return true;
}

async function run(input: AgentInput, staff: ZaloContact, user: SessionUser, say: (t: string) => Promise<unknown>) {
  const { s, chat } = input;

  const [sheets, lastCatalog, logoMsg] = await Promise.all([
    db.sheet.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, isDefault: true } }),
    lastCatalogTask(chat.chatId),
    latestLogoMessage(chat.id),
  ]);
  const catalogImages = lastCatalog ? await catalogImagesOf(lastCatalog.sessionId) : [];

  let intent: AgentIntent | null;
  try {
    const result = await getChatProvider().complete({
      model: s.chatModel,
      messages: [
        { role: "system", content: [textPart(buildIntentPrompt({ sheets, hasLogo: !!logoMsg, lastCatalogImages: catalogImages.length }))] },
        { role: "user", content: [textPart(input.text.slice(0, 1500))] },
      ],
    });
    intent = parseIntent(result.text);
  } catch (e) {
    await say(`Em chưa gọi được AI để hiểu lệnh (${e instanceof ChatError ? e.message : "lỗi mạng"}). Anh/chị thử lại sau nhé.`);
    return;
  }
  if (!intent) {
    await say('Em chưa hiểu ý anh/chị. Nói rõ hơn giúp em, ví dụ "làm mẫu chất liệu cho logo này" hoặc "ảnh 1 số 3 làm móc khóa".');
    return;
  }

  switch (intent.intent) {
    case "catalog":
      return runCatalog(input, intent, user, logoMsg, sheets, say);
    case "design":
      return runDesign(input, intent, user, lastCatalog, catalogImages, say);
    case "ask":
      return runAsk(input, intent, staff, user, say);
    case "status":
      return runStatus(chat.chatId, say);
    default:
      return void (await say(AGENT_HELP));
  }
}

/* ---------- Dữ liệu ngữ cảnh ---------- */

function lastCatalogTask(chatId: string) {
  return db.zaloBotTask.findFirst({ where: { chatId, kind: "CATALOG" }, orderBy: { createdAt: "desc" } });
}

/** Ảnh gần nhất trong cuộc chat (trong 24 giờ) dùng làm logo. */
function latestLogoMessage(contactId: string) {
  return db.zaloMessage.findFirst({
    where: { contactId, direction: "IN", kind: "IMAGE", mediaPath: { not: null }, createdAt: { gte: new Date(Date.now() - LOGO_MAX_AGE_MS) } },
    orderBy: { createdAt: "desc" },
  });
}

/** Các ảnh catalog đã xong của một phiên, theo thứ tự hiển thị, kèm số ảnh và các ô (số ô theo chiều đọc). */
async function catalogImagesOf(sessionId: string): Promise<CatalogImageCells[]> {
  const rows = await db.generatedImage.findMany({
    where: { sessionId, kind: "SHEET", status: "SUCCESS", retries: { none: {} } },
    select: { id: true, materialId: true, variantIndex: true, createdAt: true, layoutSnapshot: true, sheet: { select: { sortOrder: true } } },
  });
  rows.sort(compareSessionImages);
  return rows.map((r, i) => {
    const snap = r.layoutSnapshot as unknown as LayoutSnapshot;
    return { imageNumber: snap.imageNumber ?? i + 1, cells: snap.cells.map((c) => ({ materialId: c.materialId, code: c.code, name: c.name })) };
  });
}

const clean = (v: string | null | undefined) => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 150) : null;
};

/* ---------- Catalog ---------- */

async function runCatalog(
  input: AgentInput,
  intent: AgentIntent,
  user: SessionUser,
  logoMsg: Awaited<ReturnType<typeof latestLogoMessage>>,
  sheets: { id: string; name: string; isDefault: boolean }[],
  say: (t: string) => Promise<unknown>,
) {
  const { chat } = input;
  if (!logoMsg?.mediaPath) {
    await say("Em chưa thấy logo. Anh/chị gửi ảnh logo của khách kèm tag em (trong 24 giờ gần nhất) rồi nhắn lại giúp em nhé.");
    return;
  }
  if (await db.zaloBotTask.findFirst({ where: { chatId: chat.chatId, kind: "CATALOG", status: "RUNNING", imageMessageId: logoMsg.id }, select: { id: true } })) {
    await say("Em đang làm catalog cho logo này rồi ạ, xong em gửi ngay.");
    return;
  }

  // chọn trang mẫu: anh/chị chỉ định theo tên, không thì dùng các trang mặc định
  const wanted = (intent.sheetNames ?? []).map((n) => fold(n)).filter(Boolean);
  const chosen = wanted.length
    ? sheets.filter((sh) => wanted.some((w) => fold(sh.name).includes(w) || w.includes(fold(sh.name))))
    : sheets.filter((sh) => sh.isDefault);
  if (chosen.length === 0) {
    await say(
      wanted.length
        ? `Em không thấy trang mẫu nào tên như vậy. Các trang đang có: ${sheets.map((sh) => sh.name).join(", ") || "(chưa có)"}.`
        : `Chưa có trang mẫu mặc định nào. Anh/chị nói tên trang mẫu muốn dùng (đang có: ${sheets.map((sh) => sh.name).join(", ") || "chưa có"}) hoặc nhờ quản trị viên đặt trang mặc định.`,
    );
    return;
  }

  // khách và thương hiệu: theo lời dặn, không thì lấy tên nhóm Zalo (admin đã đặt tên ở Quản trị > Zalo > Nhóm)
  const group = input.isGroup ? await db.zaloGroup.findUnique({ where: { chatId: chat.chatId }, select: { name: true } }) : null;
  const groupName = group && !/^Nhóm mới/.test(group.name) ? clean(group.name) : null;
  const customerName = clean(intent.customerName) ?? groupName ?? clean(intent.brandName);
  const brandName = clean(intent.brandName) ?? customerName;
  if (!customerName || !brandName) {
    await say('Logo này của khách hàng và thương hiệu nào ạ? Anh/chị nhắn lại kèm tên, ví dụ "làm catalog cho logo này, khách Anh Nam, thương hiệu Cà phê Gió".');
    return;
  }

  let customer = await db.customer.findFirst({ where: { name: customerName }, include: { owner: { select: { name: true } } } });
  if (customer && !canEditCustomer(user, customer)) {
    await say(`Khách "${customer.name}" do ${customer.owner.name} phụ trách nên ${user.name} chưa thêm logo vào được. Nhờ ${customer.owner.name} hoặc quản trị viên làm giúp.`);
    return;
  }
  if (!customer) {
    customer = await db.customer.create({ data: { name: customerName, ownerId: user.id, createdById: user.id }, include: { owner: { select: { name: true } } } });
  }
  const brand =
    (await db.brand.findFirst({ where: { customerId: customer.id, name: brandName } })) ??
    (await db.brand.create({ data: { customerId: customer.id, name: brandName, createdById: user.id } }));

  // dùng lại logo nếu lệnh trước đã tạo từ đúng ảnh này cho đúng thương hiệu này
  let logoId: string | null = null;
  const prev = await db.zaloBotTask.findFirst({ where: { imageMessageId: logoMsg.id, logoId: { not: null } }, orderBy: { createdAt: "desc" }, select: { logoId: true } });
  if (prev?.logoId && (await db.logo.findFirst({ where: { id: prev.logoId, brandId: brand.id }, select: { id: true } }))) logoId = prev.logoId;
  if (!logoId) {
    try {
      const file = await getStorage().get(logoMsg.mediaPath);
      logoId = (await createLogoFromBuffer({ userId: user.id, brandId: brand.id, file, note: "Nhận từ Zalo" })).logo.id;
    } catch (e) {
      await say(e instanceof LogoError && e.userFault ? `Ảnh này em không dùng làm logo được (${e.message}) Anh/chị gửi lại file logo khác giúp em.` : "Em không lưu được logo, anh/chị thử lại sau nhé.");
      return;
    }
  }

  const created = await createCatalogSession(user, { logoId, sheetIds: chosen.map((sh) => sh.id) });
  if (!created.sessionId) {
    await say(created.error ?? "Em chưa tạo được catalog.");
    return;
  }
  await startTask(input, "CATALOG", created.sessionId, user, { logoId, imageMessageId: logoMsg.id });
  const count = await db.generatedImage.count({ where: { sessionId: created.sessionId } });
  await say(`Dạ em nhận rồi ạ. Đang tạo catalog cho "${brand.name}" (${customer.name}): ${count} ảnh, khoảng vài phút. Xong em gửi lại ngay đây.`);
}

/* ---------- Thiết kế ---------- */

async function runDesign(
  input: AgentInput,
  intent: AgentIntent,
  user: SessionUser,
  lastCatalog: Awaited<ReturnType<typeof lastCatalogTask>>,
  images: CatalogImageCells[],
  say: (t: string) => Promise<unknown>,
) {
  if (!lastCatalog) {
    await say("Cuộc chat này chưa có catalog nào em làm. Anh/chị nhờ em làm catalog trước (gửi logo kèm tag) rồi mới chọn mẫu để thiết kế được.");
    return;
  }
  if (images.length === 0) {
    await say(lastCatalog.status === "RUNNING" ? "Catalog gần nhất còn đang tạo, xong em gửi rồi anh/chị chọn mẫu nhé." : "Catalog gần nhất chưa có ảnh nào tạo xong để chọn.");
    return;
  }
  const productType = clean(intent.productType);
  if (!productType) {
    await say('Anh/chị muốn thiết kế thành sản phẩm gì ạ (móc khóa, bảng tên...)? Nhắn lại kèm loại sản phẩm giúp em, ví dụ "ảnh 1 số 3 và 5 làm móc khóa".');
    return;
  }
  const picked = resolvePicks(images, intent.picks ?? [], intent.codes ?? []);
  if (!picked.ok) {
    await say(picked.error);
    return;
  }
  const variants = Math.min(4, Math.max(1, intent.variants ?? 2));

  const created = await createDesignSession(user, {
    parentSessionId: lastCatalog.sessionId,
    materialIds: picked.materials.map((m) => m.materialId),
    productType,
    variants,
    note: intent.note ?? "",
  });
  if (!created.sessionId) {
    await say(created.error ?? "Em chưa tạo được ảnh thiết kế.");
    return;
  }
  await startTask(input, "DESIGN", created.sessionId, user, { logoId: lastCatalog.logoId, imageMessageId: null });
  await say(
    `Dạ em nhận rồi ạ. Đang thiết kế ${productType} từ ${picked.materials.length} chất liệu (${picked.materials.map((m) => m.code).join(", ")}), mỗi chất liệu ${variants} phương án. Xong em gửi lại ngay đây.`,
  );
}

async function startTask(
  input: AgentInput,
  kind: "CATALOG" | "DESIGN",
  sessionId: string,
  user: SessionUser,
  extra: { logoId: string | null; imageMessageId: string | null },
) {
  const task = await db.zaloBotTask.create({
    data: { chatId: input.chat.chatId, chatType: input.isGroup ? "GROUP" : "PRIVATE", kind, sessionId, userId: user.id, logoId: extra.logoId, imageMessageId: extra.imageMessageId },
  });
  startTaskWatch(task.id);
}

/* ---------- Hỏi kỹ thuật ---------- */

async function runAsk(input: AgentInput, intent: AgentIntent, staff: ZaloContact, user: SessionUser, say: (t: string) => Promise<unknown>) {
  const { s, chat } = input;
  const question = (intent.question ?? input.text).slice(0, 1500);

  const recent = await db.zaloMessage.findMany({
    where: { contactId: chat.id, failed: false, createdAt: { gt: chat.contextResetAt ?? new Date(0) } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const lines = recent.reverse().filter((m) => m.text).map((m) => `- ${m.author === "CONTACT" ? "Người trong nhóm" : "Bot"}: ${preview(m.text, 200)}`);
  const who = `Người hỏi là nhân viên ${staff.displayName}.`;
  const context = lines.length ? `Tin nhắn gần đây trong cuộc chat (để hiểu bối cảnh):\n${lines.join("\n")}\n\n${who}` : who;

  try {
    // vai SALE_ASSISTANT: được đọc kiến thức CÔNG KHAI và NỘI BỘ (nhân viên đã ghép nối), không bao giờ đọc ADMIN_ONLY
    const r = await answerWithKnowledge({ role: "SALE_ASSISTANT", model: s.chatModel, question, context, userId: user.id });
    await say(r.text || "Em chưa có câu trả lời cho câu này trong tài liệu của xưởng.");
  } catch (e) {
    await say(`Em chưa trả lời được lúc này (${e instanceof ChatError ? e.message : "lỗi mạng"}). Anh/chị thử lại sau nhé.`);
  }
}

/* ---------- Tiến độ ---------- */

async function runStatus(chatId: string, say: (t: string) => Promise<unknown>) {
  const running = await db.zaloBotTask.findMany({ where: { chatId, status: { in: ["RUNNING", "DELIVERING"] } }, orderBy: { createdAt: "desc" }, take: 5 });
  if (running.length === 0) {
    const last = await db.zaloBotTask.findFirst({ where: { chatId }, orderBy: { createdAt: "desc" } });
    await say(last ? `Em không có việc nào đang chạy. Việc gần nhất (${last.kind === "CATALOG" ? "catalog" : "thiết kế"}): ${last.status === "DONE" ? "đã gửi xong" : "không hoàn tất"}${last.summary ? ` (${last.summary})` : ""}.` : "Em chưa nhận việc nào trong cuộc chat này.");
    return;
  }
  const lines: string[] = [];
  for (const t of running) {
    const [done, total] = await Promise.all([
      db.generatedImage.count({ where: { sessionId: t.sessionId, retries: { none: {} }, status: { in: ["SUCCESS", "FAILED"] } } }),
      db.generatedImage.count({ where: { sessionId: t.sessionId, retries: { none: {} } } }),
    ]);
    lines.push(`• ${t.kind === "CATALOG" ? "Catalog" : "Thiết kế"}: ${done}/${total} ảnh đã xong`);
  }
  await say(`Em đang làm:\n${lines.join("\n")}\nXong em gửi lại ngay.`);
}
