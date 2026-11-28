import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ChatError, getChatProvider, text as textPart } from "@/lib/ai/chat";
import { db } from "@/lib/db";
import { getZaloSettings } from "@/lib/zalo/settings";
import { cooldownSince, inOfferCooldown, LIVE_OFFER_STATUSES, parseMaterialIds, resolveReplyIdentity, worthAiCheck } from "./offer-rules";
import { getFbReplyConfig, type FbReplyConfig } from "./reply-config";
import {
  checkAiDraft,
  DEFAULT_TEMPLATES,
  maskContacts,
  materialPhrase,
  NO_PRODUCT,
  pickNextTemplate,
  renderTemplate,
  sameWording,
  type TemplateCategory,
  type TemplatePurpose,
  type TemplateValues,
} from "./reply-text";
import { buildSupplierMessages, parseSupplierResponse } from "./supplier-ai";

/**
 * Tạo dòng trong hàng chờ trả lời sau mỗi lần quét (v1.0 mục 6.2-6.3, v1.1 mục 4). Hai bước:
 *
 * 1. `enqueueReplies` chạy NGAY trong lần nhận comment, không gọi AI: comment có liên hệ trên bài tìm nhà sản xuất được soạn
 *    câu mời từ mẫu (đứng tên fanpage hoặc nick, có chống chào lặp). Nhờ vậy AI tắt hay lỗi thì hàng chờ vẫn có câu.
 * 2. `runSupplierAi` chạy NỀN sau khi đã trả lời extension (route gọi qua after()): AI xếp loại xưởng thật / môi giới, tóm tắt
 *    năng lực, soạn câu hay hơn thay cho câu mẫu, và tìm ra xưởng trong những comment không để lại số.
 *
 * Không hàm nào ở đây gửi gì ra Facebook: chỉ ghi dòng DRAFT chờ người duyệt.
 */

export type ReplyEnv = { cfg: FbReplyConfig; defaultPage: { id: string; name: string; url: string } | null };

export async function loadReplyEnv(): Promise<ReplyEnv> {
  const [cfg, pages] = await Promise.all([
    getFbReplyConfig(),
    db.fbPage.findMany({ where: { status: "ACTIVE" }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], select: { id: true, name: true, url: true, isDefault: true } }),
  ]);
  // Chưa đánh dấu mặc định nhưng chỉ có đúng một fanpage đang bật thì dùng luôn fanpage đó
  const defaultPage = pages.find((p) => p.isDefault) ?? (pages.length === 1 ? pages[0] : null);
  return { cfg, defaultPage: defaultPage ? { id: defaultPage.id, name: defaultPage.name, url: defaultPage.url } : null };
}

export type OfferMaterialRow = { id: string; name: string; kind: string; desc: string };

type OfferPost = {
  id: string;
  purpose: "FIND_CUSTOMER" | "FIND_SUPPLIER";
  groupId: string | null;
  accountId: string;
  contentSnapshot: string | null;
  productRef: string | null;
  group: { id: string; pageJoined: boolean } | null;
  materials: OfferMaterialRow[];
};

/** Vật liệu gợi ý của một bài, theo đúng thứ tự người dùng chọn; vật liệu đã tắt hoặc đã xóa thì bỏ qua. */
export async function loadSuggestedMaterials(raw: unknown): Promise<OfferMaterialRow[]> {
  const ids = parseMaterialIds(raw);
  if (ids.length === 0) return [];
  const rows = await db.material.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, name: true, groupName: true, printTech: true, descHuman: true } });
  const byId = new Map(rows.map((m) => [m.id, m]));
  return ids.flatMap((id) => {
    const m = byId.get(id);
    return m ? [{ id: m.id, name: m.name, kind: [m.groupName, m.printTech].filter(Boolean).join(", "), desc: m.descHuman }] : [];
  });
}

async function loadOfferPost(postId: string): Promise<OfferPost | null> {
  const post = await db.fbPost.findUnique({
    where: { id: postId },
    select: { id: true, purpose: true, groupId: true, accountId: true, contentSnapshot: true, productRef: true, suggestedMaterialIds: true, group: { select: { id: true, pageJoined: true } } },
  });
  if (!post) return null;
  const { suggestedMaterialIds, ...rest } = post;
  return { ...rest, materials: await loadSuggestedMaterials(suggestedMaterialIds) };
}

const UNKNOWN_NAME = "(không rõ tên)";

function templateValues(post: OfferPost, env: ReplyEnv, authorName: string): TemplateValues {
  return {
    ten: authorName === UNKNOWN_NAME ? "" : authorName,
    ten_page: env.defaultPage?.name ?? "",
    link_page: env.defaultPage?.url ?? "",
    san_pham: post.productRef?.trim() || NO_PRODUCT,
    vat_lieu_goi_y: materialPhrase(post.materials),
  };
}

/** Các câu đã soạn / đã sửa trong cùng bài (trừ dòng `exceptId`), để không lặp nguyên văn. */
async function usedTextsInPost(postId: string, exceptId?: string): Promise<string[]> {
  const rows = await db.fbReplyQueue.findMany({
    where: { comment: { postId }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 60,
    select: { draftText: true, finalText: true },
  });
  return rows.flatMap((r) => [r.finalText, r.draftText].filter((t): t is string => !!t));
}

/**
 * Soạn câu từ mẫu: lấy mẫu đang bật trong CSDL (chưa có thì dùng mẫu có sẵn trong code), chọn mẫu kế tiếp sau mẫu vừa dùng ở
 * comment trước trong cùng bài, và bỏ qua mẫu nào cho ra đúng nguyên văn một câu đã có trong bài.
 */
async function draftFromTemplate(postId: string, kind: { purpose: TemplatePurpose; category: TemplateCategory }, intent: "ANSWER_INTEREST" | "SUPPLIER_OFFER", values: TemplateValues): Promise<{ text: string; templateId: string | null }> {
  const [rows, prior, used] = await Promise.all([
    db.fbReplyTemplate.findMany({ where: { purpose: kind.purpose, category: kind.category, active: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, text: true } }),
    db.fbReplyQueue.findMany({ where: { intent, comment: { postId } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { templateId: true } }),
    usedTextsInPost(postId),
  ]);
  const builtin = rows.length === 0;
  const list = builtin ? DEFAULT_TEMPLATES.filter((t) => t.purpose === kind.purpose && t.category === kind.category).map((t, i) => ({ id: `builtin-${i}`, text: t.text })) : rows;
  if (list.length === 0) return { text: "", templateId: null };

  // Mẫu có sẵn không có mã trong CSDL: xoay theo số dòng đã soạn của bài
  const count = builtin ? await db.fbReplyQueue.count({ where: { intent, comment: { postId } } }) : 0;
  const first = builtin ? list[count % list.length] : pickNextTemplate(list, prior[0]?.templateId ?? null)!;
  const start = list.indexOf(first);
  for (let i = 0; i < list.length; i++) {
    const t = list[(start + i) % list.length];
    const text = renderTemplate(t.text, values);
    if (!used.some((u) => sameWording(u, text))) return { text, templateId: builtin ? null : t.id };
  }
  return { text: renderTemplate(first.text, values), templateId: builtin ? null : first.id };
}

/** Tạo dòng hàng chờ; comment này đã có dòng (hai lần quét chạy song song) thì trả null. */
async function createRow(data: Prisma.FbReplyQueueUncheckedCreateInput): Promise<string | null> {
  try {
    return (await db.fbReplyQueue.create({ data, select: { id: true } })).id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }
}

type OfferOutcome = "created" | "cooldown" | "no_identity" | "exists" | "no_template";

/**
 * Soạn một câu mời dùng vật liệu cho comment của một nhà sản xuất (v1.1 mục 4.1 bước 2 và 3).
 * `aiDraft` là câu AI đã soạn VÀ đã qua kiểm tra; không có thì dùng mẫu.
 */
async function queueSupplierOffer(post: OfferPost, env: ReplyEnv, comment: { id: string; authorName: string }, leadId: string, now: Date, aiDraft?: string): Promise<OfferOutcome> {
  const days = env.cfg.offerCooldownDays;
  const [lead, latest] = await Promise.all([
    db.fbLead.findUnique({ where: { id: leadId }, select: { lastOfferedAt: true } }),
    days > 0
      ? db.fbReplyQueue.findFirst({
          where: { leadId, intent: "SUPPLIER_OFFER", status: { in: [...LIVE_OFFER_STATUSES] }, createdAt: { gte: cooldownSince(now, days) } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        })
      : Promise.resolve(null),
  ]);
  if (inOfferCooldown({ lastOfferedAt: lead?.lastOfferedAt ?? null, latestOfferQueuedAt: latest?.createdAt ?? null, now, cooldownDays: days })) return "cooldown";

  const identity = resolveReplyIdentity({
    hasDefaultPage: env.defaultPage !== null,
    inGroup: post.groupId !== null,
    pageJoined: post.group?.pageJoined ?? false,
    fallback: env.cfg.fallbackWhenPageUnavailable,
  });
  if (!identity) return "no_identity";

  const tpl = await draftFromTemplate(post.id, { purpose: "FIND_SUPPLIER", category: "SUPPLIER_OFFER" }, "SUPPLIER_OFFER", templateValues(post, env, comment.authorName));
  const draftText = aiDraft ?? tpl.text;
  if (!draftText) return "no_template";
  const id = await createRow({
    commentId: comment.id,
    accountId: post.accountId,
    leadId,
    intent: "SUPPLIER_OFFER",
    replyAs: identity.replyAs,
    pageId: identity.replyAs === "PAGE" ? env.defaultPage!.id : null,
    templateId: tpl.templateId,
    draftText,
    aiGenerated: aiDraft !== undefined,
    createdAt: now,
  });
  return id ? "created" : "exists";
}

/** Câu dẫn khách về inbox fanpage cho comment "ib" / câu hỏi trên bài tìm khách (v1.0 mục 6.2). Luôn đứng tên nick đã quét bài. */
async function queueInterestReply(post: OfferPost, env: ReplyEnv, comment: { id: string; authorName: string }, category: "INTEREST" | "QUESTION", now: Date): Promise<boolean> {
  const tpl = await draftFromTemplate(post.id, { purpose: "FIND_CUSTOMER", category }, "ANSWER_INTEREST", templateValues(post, env, comment.authorName));
  if (!tpl.text) return false;
  const id = await createRow({ commentId: comment.id, accountId: post.accountId, intent: "ANSWER_INTEREST", replyAs: "ACCOUNT", templateId: tpl.templateId, draftText: tpl.text, createdAt: now });
  return id !== null;
}

/**
 * Lead của người comment ở bài tìm nhà sản xuất phải là lead nhà sản xuất (v1.1 mục 4.1 bước 1). Lead khách đang được sale xử lý
 * (đã qua trạng thái Mới) thì giữ nguyên loại, để không tự nhiên biến mất khỏi danh sách khách.
 */
async function markSupplierLead(leadId: string): Promise<{ supplierType: string | null } | null> {
  const lead = await db.fbLead.findUnique({ where: { id: leadId }, select: { leadType: true, status: true, supplierType: true } });
  if (!lead) return null;
  const leadType = lead.leadType !== "SUPPLIER" && lead.status === "NEW" ? "SUPPLIER" : lead.leadType;
  const supplierType = leadType === "SUPPLIER" ? (lead.supplierType ?? "UNKNOWN") : lead.supplierType;
  if (leadType !== lead.leadType || supplierType !== lead.supplierType) await db.fbLead.update({ where: { id: leadId }, data: { leadType, supplierType } });
  return { supplierType };
}

export type EnqueueResult = { offers: number; interestReplies: number; aiCommentIds: string[] };

/**
 * Bước 1, chạy ngay sau khi lưu comment của một lần quét. `fbCommentIds` là các comment mới hoặc vừa sửa trong lần quét đó.
 * Trả về số dòng đã tạo và các comment cần AI xem ở bước 2.
 */
export async function enqueueReplies(input: { postId: string; fbCommentIds: string[]; now: Date }): Promise<EnqueueResult> {
  const result: EnqueueResult = { offers: 0, interestReplies: 0, aiCommentIds: [] };
  if (input.fbCommentIds.length === 0) return result;
  const [post, env] = await Promise.all([loadOfferPost(input.postId), loadReplyEnv()]);
  if (!post) return result;
  if (post.purpose === "FIND_CUSTOMER" && !env.cfg.replyInterestEnabled) return result;

  const order = new Map(input.fbCommentIds.map((id, i) => [id, i]));
  const comments = (
    await db.fbComment.findMany({
      where: { postId: post.id, fbCommentId: { in: input.fbCommentIds } },
      select: { id: true, fbCommentId: true, authorName: true, text: true, isOwn: true, category: true, handled: true, reply: { select: { id: true } }, sources: { select: { leadId: true }, take: 1 } },
    })
  ).sort((a, b) => (order.get(a.fbCommentId) ?? 0) - (order.get(b.fbCommentId) ?? 0));

  for (const c of comments) {
    if (c.isOwn) continue;
    // đã có dòng trong hàng chờ, hoặc nick / fanpage của mình đã trả lời comment này rồi: không soạn thêm
    const answered = c.reply !== null || c.handled;
    if (post.purpose === "FIND_CUSTOMER") {
      if (!answered && (c.category === "INTEREST" || c.category === "QUESTION") && (await queueInterestReply(post, env, c, c.category, input.now))) result.interestReplies++;
      continue;
    }
    const leadId: string | null = c.sources[0]?.leadId ?? null;
    if (leadId) {
      const lead = await markSupplierLead(leadId);
      const outcome = answered ? "exists" : await queueSupplierOffer(post, env, c, leadId, input.now);
      if (outcome === "created") result.offers++;
      // AI xem khi vừa có câu mời mới (để soạn câu hay hơn), hoặc khi lead chưa được xếp loại
      if (env.cfg.supplierAiEnabled && (outcome === "created" || !lead?.supplierType || lead.supplierType === "UNKNOWN")) result.aiCommentIds.push(c.id);
    } else if (env.cfg.supplierAiEnabled && worthAiCheck(c)) {
      result.aiCommentIds.push(c.id);
    }
  }
  return result;
}

/** Lead cho xưởng mà AI nhận ra trong comment KHÔNG có liên hệ (v1.1 mục 4.1: "hoặc AI xếp là manufacturer"). Gộp theo link trang cá nhân. */
async function contactlessSupplierLead(post: OfferPost, c: { id: string; authorName: string; authorProfileUrl: string | null }): Promise<{ leadId: string; created: boolean } | null> {
  const existing = c.authorProfileUrl ? await db.fbLead.findFirst({ where: { leadType: "SUPPLIER", phone: null, email: null, profileUrl: c.authorProfileUrl }, select: { id: true } }) : null;
  try {
    if (existing) {
      await db.fbLeadSource.create({ data: { leadId: existing.id, commentId: c.id } });
      return { leadId: existing.id, created: false };
    }
    const lead = await db.fbLead.create({
      data: { commentId: c.id, postId: post.id, groupId: post.groupId, name: c.authorName, profileUrl: c.authorProfileUrl, leadType: "SUPPLIER", supplierType: "MANUFACTURER", sources: { create: { commentId: c.id } } },
      select: { id: true },
    });
    return { leadId: lead.id, created: true };
  } catch (e) {
    // comment này vừa được một lần chạy khác gắn lead
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const src = await db.fbLeadSource.findUnique({ where: { commentId: c.id }, select: { leadId: true } });
      return src ? { leadId: src.leadId, created: false } : null;
    }
    throw e;
  }
}

/** Giới hạn mỗi lần quét, để một bài vài trăm comment không gọi AI vô hạn. Phần vượt giới hạn giữ câu mẫu và loại "chưa rõ". */
export const MAX_AI_PER_BATCH = 60;
const AI_TIMEOUT_MS = 45_000;
const MAX_AI_ATTEMPTS = 2;
/** Lỗi không tự hết khi hỏi lại (sai khóa, hết tiền, sai tên model): dừng cả lượt thay vì hỏi tiếp từng comment. */
const FATAL_CHAT_CODES = [401, 402, 404];

export type SupplierAiSummary = { asked: number; classified: number; drafted: number; newLeads: number; newOffers: number; skippedReplies: number; stopped: string | null };

/**
 * Bước 2 (chạy nền). Với từng comment: hỏi AI, ghi loại nhà sản xuất và năng lực vào lead, thay câu mẫu bằng câu AI soạn nếu câu
 * đó qua được kiểm tra (checkAiDraft), và tạo lead + câu mời cho xưởng không để lại liên hệ. Dòng đã được người duyệt hoặc đã
 * sửa tay thì không đụng tới. AI lỗi hay trả lời sai dạng: bỏ qua comment đó, câu mẫu và loại "chưa rõ" giữ nguyên.
 */
export async function runSupplierAi(input: { postId: string; commentIds: string[]; now?: Date }): Promise<SupplierAiSummary> {
  const summary: SupplierAiSummary = { asked: 0, classified: 0, drafted: 0, newLeads: 0, newOffers: 0, skippedReplies: 0, stopped: null };
  const ids = input.commentIds.slice(0, MAX_AI_PER_BATCH);
  if (ids.length === 0) return summary;
  const now = input.now ?? new Date();
  const [post, env, zalo] = await Promise.all([loadOfferPost(input.postId), loadReplyEnv(), getZaloSettings()]);
  if (!post || post.purpose !== "FIND_SUPPLIER" || !env.cfg.supplierAiEnabled) return summary;
  if (input.commentIds.length > ids.length) console.warn(`AI nhà sản xuất (bài ${post.id}): ${input.commentIds.length} comment, chỉ xem ${ids.length} comment đầu.`);

  const chat = getChatProvider();
  const pageName = env.defaultPage?.name ?? null;
  const materialNames = post.materials.map((m) => m.name);

  for (const id of ids) {
    const c = await db.fbComment.findUnique({
      where: { id },
      select: {
        id: true,
        postId: true,
        text: true,
        authorName: true,
        authorProfileUrl: true,
        isOwn: true,
        category: true,
        handled: true,
        extractedPhone: true,
        extractedOther: true,
        reply: { select: { id: true, status: true, finalText: true } },
        sources: { select: { leadId: true }, take: 1 },
      },
    });
    if (!c || c.postId !== post.id || c.isOwn || c.category === "SPAM") continue;

    const used = await usedTextsInPost(post.id, c.reply?.id);
    const { system, user } = buildSupplierMessages({
      postContent: post.contentSnapshot ?? "",
      productRef: post.productRef,
      comment: maskContacts(c.text),
      pageName,
      materials: post.materials,
      usedDrafts: used,
    });
    let parsed: ReturnType<typeof parseSupplierResponse> = null;
    try {
      summary.asked++;
      // AI thỉnh thoảng trả lời sai dạng tới mức không vớt được: hỏi lại thêm một lần rồi mới bỏ qua comment này (như D121)
      for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS && !parsed; attempt++) {
        const r = await chat.complete({
          model: zalo.chatModel,
          messages: [
            { role: "system", content: [textPart(system)] },
            { role: "user", content: [textPart(user)] },
          ],
          signal: AbortSignal.timeout(AI_TIMEOUT_MS),
        });
        parsed = parseSupplierResponse(r.text);
        if (!parsed) console.error(`AI nhà sản xuất (bài ${post.id}, model ${zalo.chatModel}, lần ${attempt}/${MAX_AI_ATTEMPTS}): không đọc được câu trả lời:`, r.text.slice(0, 500));
      }
    } catch (e) {
      console.error(`AI nhà sản xuất lỗi (bài ${post.id}, model ${zalo.chatModel}):`, e instanceof Error ? e.message : e);
      if (e instanceof ChatError && FATAL_CHAT_CODES.includes(e.code)) {
        summary.stopped = e.message;
        break;
      }
      continue;
    }
    if (!parsed) continue;
    summary.classified++;

    let leadId: string | null = c.sources[0]?.leadId ?? null;
    if (!leadId && parsed.supplierType === "MANUFACTURER") {
      const made = await contactlessSupplierLead(post, c);
      if (made?.created) summary.newLeads++;
      leadId = made?.leadId ?? null;
    }
    if (!leadId) continue; // không có liên hệ và AI không xếp là xưởng: không tạo gì

    const lead = await db.fbLead.findUnique({ where: { id: leadId }, select: { leadType: true } });
    if (lead) {
      await db.fbLead.update({
        where: { id: leadId },
        data: { ...(lead.leadType === "SUPPLIER" ? { supplierType: parsed.supplierType } : {}), ...(parsed.capability ? { capability: parsed.capability } : {}) },
      });
    }

    const other = c.extractedOther as { phones?: unknown } | null;
    const phones = [c.extractedPhone, ...(Array.isArray(other?.phones) ? other.phones : [])].filter((p): p is string => typeof p === "string");
    const draft = parsed.draft ? renderTemplate(parsed.draft, templateValues(post, env, c.authorName)) : "";
    const check = draft ? checkAiDraft(draft, { pageName, materialNames, commenterPhones: phones, usedTexts: used }) : ({ ok: false, reason: "AI không soạn câu" } as const);

    if (c.reply) {
      if (c.reply.status !== "DRAFT" || c.reply.finalText) continue; // người đã duyệt hoặc đã sửa tay: giữ nguyên
      if (!parsed.shouldReply) {
        await db.fbReplyQueue.update({ where: { id: c.reply.id }, data: { status: "SKIPPED", failReason: "ai_should_not_reply" } });
        summary.skippedReplies++;
      } else if (check.ok) {
        await db.fbReplyQueue.update({ where: { id: c.reply.id }, data: { draftText: draft, aiGenerated: true } });
        summary.drafted++;
      }
    } else if (parsed.shouldReply && !c.handled) {
      const outcome = await queueSupplierOffer(post, env, c, leadId, now, check.ok ? draft : undefined);
      if (outcome === "created") {
        summary.newOffers++;
        if (check.ok) summary.drafted++;
      }
    }
  }

  if (summary.newLeads > 0) {
    const leadCount = await db.fbLeadSource.count({ where: { comment: { postId: post.id } } });
    await db.fbPost.update({ where: { id: post.id }, data: { leadCount } });
  }
  // Một dòng trong nhật ký máy chủ cho mỗi lượt, để khi "quét mà không thấy gì" còn biết AI đã xem và kết luận ra sao
  console.info(
    `AI nhà sản xuất (bài ${post.id}): xem ${summary.asked} comment, đọc được ${summary.classified}, lead mới ${summary.newLeads}, câu mời mới ${summary.newOffers}, câu AI soạn ${summary.drafted}, bỏ qua ${summary.skippedReplies}${summary.stopped ? `, dừng vì: ${summary.stopped}` : ""}.`,
  );
  return summary;
}

/** Giới hạn số comment đã có được xét lại trong một lần bấm (bài rất nhiều comment thì bấm thêm lần nữa). */
const MAX_BACKFILL_COMMENTS = 300;

/**
 * Soạn câu mời cho những comment ĐÃ QUÉT TỪ TRƯỚC của một bài tìm nhà sản xuất: dùng khi bài được đổi sang "Tìm bên sản xuất" sau
 * khi đã có comment, hoặc khi lần xét trước bị lỡ (AI lỗi). Chỉ xét comment của người khác, chưa có dòng trong hàng chờ, chưa có
 * trả lời của nick / fanpage và không phải spam. Đi đúng các quy tắc của lần quét (chống chào lặp, người đứng tên); trả về các
 * comment cần AI xem để nơi gọi chạy `runSupplierAi` ở nền. Chỉ tạo dòng CHỜ DUYỆT, không gửi gì.
 */
export async function backfillPostOffers(postId: string, now = new Date()): Promise<EnqueueResult & { considered: number }> {
  const comments = await db.fbComment.findMany({
    where: { postId, isOwn: false, handled: false, reply: null, category: { not: "SPAM" } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MAX_BACKFILL_COMMENTS,
    select: { fbCommentId: true },
  });
  const result = await enqueueReplies({ postId, fbCommentIds: comments.map((c) => c.fbCommentId), now });
  return { ...result, considered: comments.length };
}
