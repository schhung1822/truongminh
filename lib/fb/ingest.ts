import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { FbPostPurpose } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { prepareComment, type IngestPayload, type PreparedComment } from "./comments";

export type IngestInput = {
  post: { id: string; groupId: string | null; purpose: FbPostPurpose };
  account: { profileUrl: string };
  tokenId: string;
  payload: IngestPayload;
  now?: Date;
};

export type IngestResult = { newComments: number; updatedComments: number; newLeads: number; leadSources: number };

type Stored = { id: string; authorName: string; authorProfileUrl: string | null; extractedPhone: string | null; extractedOther: PreparedComment["extractedOther"] };

/**
 * Lưu một lần quét (docs/thiet-ke-module-lead-facebook.md mục 7.3): upsert comment theo (bài, mã comment Facebook), tách số
 * và phân loại cho comment mới hoặc vừa sửa, tạo lead (cùng số điện thoại thì chỉ thêm nguồn), cập nhật bộ đếm của bài.
 * Chạy lại cùng dữ liệu không tạo dòng trùng. Không có bước nào gửi gì ra Facebook.
 */
export async function ingestComments(opts: IngestInput): Promise<IngestResult> {
  const now = opts.now ?? new Date();
  const { post } = opts;

  // Một mã comment xuất hiện hai lần trong cùng lần gửi: lấy bản cuối
  const byId = new Map<string, PreparedComment>();
  for (const raw of opts.payload.comments) {
    byId.set(raw.fb_comment_id, prepareComment(raw, { accountProfileUrl: opts.account.profileUrl, now }));
  }
  const prepared = [...byId.values()];

  const existing = await db.fbComment.findMany({
    where: { postId: post.id, fbCommentId: { in: prepared.map((p) => p.fbCommentId) } },
    select: { id: true, fbCommentId: true, text: true, isOwn: true },
  });
  const existingByFbId = new Map(existing.map((e) => [e.fbCommentId, e]));

  const toCreate = prepared.filter((p) => !existingByFbId.has(p.fbCommentId));
  const toUpdate = prepared.filter((p) => {
    const e = existingByFbId.get(p.fbCommentId);
    return !!e && (e.text !== p.text || e.isOwn !== p.isOwn);
  });

  if (toCreate.length > 0) {
    await db.fbComment.createMany({
      data: toCreate.map((p) => ({
        postId: post.id,
        fbCommentId: p.fbCommentId,
        parentFbCommentId: p.parentFbCommentId,
        authorName: p.authorName,
        authorProfileUrl: p.authorProfileUrl,
        isOwn: p.isOwn,
        text: p.text,
        timeText: p.timeText,
        commentedAt: p.commentedAt,
        category: p.category,
        extractedPhone: p.extractedPhone,
        ...(p.extractedOther ? { extractedOther: p.extractedOther } : {}),
      })),
      skipDuplicates: true,
    });
  }
  for (const p of toUpdate) {
    await db.fbComment.update({
      where: { postId_fbCommentId: { postId: post.id, fbCommentId: p.fbCommentId } },
      data: {
        text: p.text,
        isOwn: p.isOwn,
        timeText: p.timeText,
        category: p.category,
        extractedPhone: p.extractedPhone,
        extractedOther: p.extractedOther ?? Prisma.DbNull,
      },
    });
  }

  // Lead: chỉ từ comment của người khác có liên hệ, mới tạo hoặc vừa sửa
  const needLead = [...toCreate, ...toUpdate].filter((p) => p.category === "HAS_CONTACT" && !p.isOwn);
  let newLeads = 0;
  let leadSources = 0;
  if (needLead.length > 0) {
    const rows = await db.fbComment.findMany({
      where: { postId: post.id, fbCommentId: { in: needLead.map((p) => p.fbCommentId) } },
      select: { id: true, fbCommentId: true, authorName: true, authorProfileUrl: true, extractedPhone: true, extractedOther: true, sources: { select: { id: true }, take: 1 } },
    });
    for (const row of rows) {
      if (row.sources.length > 0) continue; // comment này đã sinh lead / đã ghi nguồn từ lần quét trước
      const stored: Stored = { ...row, extractedOther: row.extractedOther as PreparedComment["extractedOther"] };
      const r = await attachLead(post, stored);
      if (r === "created") newLeads++;
      else if (r === "source") leadSources++;
    }
  }

  // Bộ đếm và mốc quét của bài
  const [commentCount, leadCount] = await Promise.all([
    db.fbComment.count({ where: { postId: post.id } }),
    db.fbLeadSource.count({ where: { comment: { postId: post.id } } }),
  ]);
  const scannedAt = clampScannedAt(opts.payload.scanned_at, now);
  await db.fbPost.update({
    where: { id: post.id },
    data: {
      commentCount,
      leadCount,
      ...(opts.payload.complete ? { lastScannedAt: scannedAt } : {}), // quét dở thì chưa tính là đã quét, chu kỳ sau thử lại
      ...(toCreate.length > 0 ? { lastCommentAt: now } : {}),
    },
  });

  await db.extLog.create({
    data: {
      tokenId: opts.tokenId,
      type: opts.payload.complete ? "SCAN_OK" : "SCAN_FAIL",
      detail: { post_id: post.id, received: opts.payload.comments.length, new_comments: toCreate.length, updated_comments: toUpdate.length, new_leads: newLeads, complete: opts.payload.complete },
    },
  });

  return { newComments: toCreate.length, updatedComments: toUpdate.length, newLeads, leadSources };
}

/** Thời điểm quét: lấy giờ extension báo nhưng không cho nằm trong tương lai (đồng hồ máy lệch). */
function clampScannedAt(raw: string | undefined, now: Date): Date {
  if (!raw) return now;
  const t = new Date(raw);
  return Number.isNaN(t.getTime()) || t.getTime() > now.getTime() ? now : t;
}

/** Gắn comment có liên hệ vào lead: cùng số điện thoại (hoặc cùng email khi không có số) thì thêm nguồn, chưa có thì tạo lead. */
async function attachLead(post: IngestInput["post"], c: Stored): Promise<"created" | "source"> {
  const phone = c.extractedPhone;
  const email = c.extractedOther?.emails[0] ?? null;
  const zalo = c.extractedOther?.zalo ?? null;

  const find = () =>
    phone ? db.fbLead.findUnique({ where: { phone } }) : email ? db.fbLead.findFirst({ where: { phone: null, email } }) : Promise.resolve(null);

  const addSource = async (lead: { id: string; zalo: string | null; email: string | null }) => {
    await db.fbLeadSource.create({ data: { leadId: lead.id, commentId: c.id } });
    // bổ sung thông tin còn thiếu của lead từ comment mới
    const patch: { zalo?: string; email?: string } = {};
    if (!lead.zalo && zalo) patch.zalo = zalo;
    if (!lead.email && email) patch.email = email;
    if (Object.keys(patch).length > 0) await db.fbLead.update({ where: { id: lead.id }, data: patch });
  };

  const found = await find();
  if (found) {
    await addSource(found);
    return "source";
  }

  try {
    await db.fbLead.create({
      data: {
        commentId: c.id,
        postId: post.id,
        groupId: post.groupId,
        name: c.authorName,
        phone,
        zalo,
        email,
        profileUrl: c.authorProfileUrl,
        leadType: post.purpose === "FIND_SUPPLIER" ? "SUPPLIER" : "CUSTOMER",
        sources: { create: { commentId: c.id } },
      },
    });
    return "created";
  } catch (e) {
    // hai lần quét cùng tạo lead cho một số: lead kia đã có, chỉ thêm nguồn
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await find();
      if (again) {
        await addSource(again).catch(() => undefined);
        return "source";
      }
    }
    throw e;
  }
}
