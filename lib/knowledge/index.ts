import "server-only";
import { ChatError, getChatProvider, text as textPart } from "@/lib/ai/chat";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { stripMarkdown } from "@/lib/zalo/text";
import { formatKnowledge, formatMaterials, type ProfileData } from "./format";
import { articleWhere } from "./query";
import { buildKnowledgeSystemPrompt, extractUnknown, gapKey } from "./rules";
import { isAiRole, isVisibility, isVisibleTo, PROFILE_FIELDS, ROLE_INFO, type AiRole, type ProfileFieldKey } from "./roles";
import { selectWithinBudget, type Candidate } from "./select";

export const PROFILE_ID = "main";
const BUDGET_KEY = (role: AiRole) => `knowledge.budget.${role}`;

/** Hồ sơ doanh nghiệp. Tên xưởng đọc từ settings (một nguồn chung với chân ảnh). */
export async function getBusinessProfile(): Promise<ProfileData & { updatedAt: Date | null }> {
  const [row, settings] = await Promise.all([db.businessProfile.findUnique({ where: { id: PROFILE_ID } }), getSettings()]);
  const fields: ProfileData["fields"] = {};
  if (row) for (const f of PROFILE_FIELDS) fields[f.key as ProfileFieldKey] = row[f.key as ProfileFieldKey];
  return { workshopName: settings.workshopName, fields, visibility: row?.visibility ?? {}, updatedAt: row?.updatedAt ?? null };
}

/** Ngân sách ký tự của một vai: giá trị admin đặt, không có thì mặc định. */
export async function getRoleBudget(role: AiRole): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: BUDGET_KEY(role) } });
  const v = row?.value;
  return typeof v === "number" && Number.isFinite(v) && v >= 500 && v <= 60_000 ? Math.round(v) : ROLE_INFO[role].budgetChars;
}

export async function getAllBudgets(): Promise<Record<AiRole, number>> {
  const out = {} as Record<AiRole, number>;
  for (const role of Object.keys(ROLE_INFO) as AiRole[]) out[role] = await getRoleBudget(role);
  return out;
}

export async function setRoleBudget(role: AiRole, chars: number): Promise<void> {
  await db.setting.upsert({ where: { key: BUDGET_KEY(role) }, create: { key: BUDGET_KEY(role), value: chars }, update: { value: chars } });
}

export type KnowledgeResult = { text: string; usedIds: string[]; droppedIds: string[]; workshopName: string };

/**
 * Kiến thức cho một vai AI: hồ sơ (phần được đọc) và các bài ĐANG DÙNG, đúng mức hiển thị và đúng vai, trong ngân sách.
 * Mọi AI trò chuyện trong hệ thống lấy kiến thức qua hàm này.
 */
export async function getKnowledgeForAI(input: { role: AiRole; question?: string; now?: Date }): Promise<KnowledgeResult> {
  const { role, question = "" } = input;
  if (!isAiRole(role)) throw new Error(`Vai AI không hợp lệ: ${String(role)}`);

  const [profile, rows, budget] = await Promise.all([
    getBusinessProfile(),
    db.knowledgeArticle.findMany({
      where: articleWhere(role, input.now ?? new Date()),
      include: { roles: { select: { role: true } } },
    }),
    getRoleBudget(role),
  ]);

  // lớp kiểm tra thứ hai: dù câu truy vấn sai thì bài không hợp mức hoặc vai vẫn bị loại
  const candidates: Candidate[] = rows
    .filter((a) => isVisibility(a.visibility) && isVisibleTo(role, { visibility: a.visibility, roles: a.roles.map((r) => r.role) }))
    .map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      body: a.body,
      tags: Array.isArray(a.tags) ? a.tags.filter((t): t is string => typeof t === "string") : [],
      priority: a.priority,
      alwaysInclude: a.alwaysInclude,
      updatedAt: a.updatedAt,
    }));

  const { chosen, dropped } = selectWithinBudget(candidates, budget, question);
  return {
    text: formatKnowledge(role, profile, chosen),
    usedIds: chosen.map((a) => a.id),
    droppedIds: dropped.map((a) => a.id),
    workshopName: profile.workshopName,
  };
}

/** Danh sách chất liệu cho một vai AI, lấy trực tiếp từ bảng materials. */
export async function getMaterialsText(role: AiRole, question = ""): Promise<string> {
  const materials = await db.material.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { code: true, name: true, groupName: true, printTech: true, descHuman: true, thicknessMm: true },
  });
  return formatMaterials(role, materials, question);
}

/** Câu hỏi/kiến thức ngắn cho vai chăm sóc nhóm (tên chất liệu chung và kiến thức đã lọc). */
export async function prepareKnowledgePrompt(input: {
  role: AiRole;
  question?: string;
  contactName?: string;
  isGroup?: boolean;
  extra?: string;
}): Promise<{ system: string; usedIds: string[]; droppedIds: string[] }> {
  const [k, materials] = await Promise.all([getKnowledgeForAI({ role: input.role, question: input.question }), getMaterialsText(input.role, input.question)]);
  return {
    system: buildKnowledgeSystemPrompt({
      role: input.role,
      workshopName: k.workshopName,
      knowledge: k.text,
      materials,
      contactName: input.contactName,
      isGroup: input.isGroup,
      extra: input.extra,
    }),
    usedIds: k.usedIds,
    droppedIds: k.droppedIds,
  };
}

/** Ghi lại lượt dùng kiến thức; nếu AI báo chưa có thông tin thì gom câu hỏi vào danh sách "chưa trả lời được". Không bao giờ ném lỗi. */
export async function recordKnowledgeUse(input: {
  role: AiRole;
  question: string;
  usedIds: string[];
  droppedIds: string[];
  unknown: boolean;
  userId?: string | null;
}): Promise<void> {
  try {
    const question = input.question.replace(/\s+/g, " ").trim().slice(0, 500);
    await db.knowledgeUse.create({
      data: { role: input.role, question, usedIds: input.usedIds, droppedIds: input.droppedIds, unknown: input.unknown, userId: input.userId ?? null },
    });
    if (input.unknown && question) {
      const key = gapKey(input.role, question);
      const now = new Date();
      await db.knowledgeGap.upsert({
        where: { key },
        create: { key, role: input.role, question, lastAskedAt: now, firstAskedAt: now },
        update: { count: { increment: 1 }, lastAskedAt: now, status: "OPEN", resolvedByArticleId: null },
      });
    }
  } catch (e) {
    console.error("Kho kiến thức: không ghi được lượt dùng:", e instanceof Error ? e.message : e);
  }
}

export type KnowledgeAnswer = {
  text: string;
  unknown: boolean;
  usedIds: string[];
  droppedIds: string[];
  tokens: number;
};

/**
 * Hỏi AI một câu theo vai, có kiến thức đã lọc, rồi ghi log. Dùng chung cho trợ lý sale (tag bot) và trang Thử AI.
 * Ném ChatError nếu AI lỗi (người gọi quyết định báo gì).
 */
export async function answerWithKnowledge(input: {
  role: AiRole;
  model: string;
  question: string;
  /** bối cảnh thêm (ví dụ tin gần đây trong cuộc chat), được đặt trước câu hỏi */
  context?: string;
  contactName?: string;
  userId?: string | null;
  /** false = không ghi log (Thử AI vẫn nên ghi để admin thấy; mặc định true) */
  log?: boolean;
}): Promise<KnowledgeAnswer> {
  const question = input.question.slice(0, 1500);
  const p = await prepareKnowledgePrompt({ role: input.role, question, contactName: input.contactName });
  const user = (input.context ? `${input.context}\n\n` : "") + `Câu hỏi: ${question}`;
  const r = await getChatProvider().complete({
    model: input.model,
    messages: [
      { role: "system", content: [textPart(p.system)] },
      { role: "user", content: [textPart(user)] },
    ],
  });
  const { text, unknown } = extractUnknown(r.text);
  if (input.log !== false) await recordKnowledgeUse({ role: input.role, question, usedIds: p.usedIds, droppedIds: p.droppedIds, unknown, userId: input.userId });
  return { text: stripMarkdown(text).trim(), unknown, usedIds: p.usedIds, droppedIds: p.droppedIds, tokens: r.promptTokens + r.completionTokens };
}

export { ChatError };
