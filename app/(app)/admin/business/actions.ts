"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { answerWithKnowledge, ChatError, PROFILE_ID, setRoleBudget } from "@/lib/knowledge";
import { isAiRole, isVisibility, PROFILE_FIELDS, ROLE_INFO, type AiRole } from "@/lib/knowledge/roles";
import { settingsSchema } from "@/lib/settings";
import { getZaloSettings } from "@/lib/zalo/settings";
import {
  articleSchema,
  firstIssue,
  formatEffectiveFrom,
  formToInput,
  normalizeArticle,
  parseEffectiveFrom,
  parseTagsJson,
  type ArticleFormInput,
  type ArticleInput,
} from "./article-schema";
import { parsePricingValue } from "./pricing-value";
import { MAX_CSV_BYTES, MAX_CSV_ROWS, parseArticlesCsv, rowToArticle } from "./articles-csv";

export type ActionResult = { error?: string; ok?: string };

function refresh() {
  revalidatePath("/admin/business", "layout");
  revalidatePath("/business");
}

/* ---------- Hồ sơ doanh nghiệp ---------- */

const FIELD_MAX: Record<string, number> = { tradeName: 200, hotline: 100, zalo: 200, fanpage: 300, website: 300 };

export type ProfileFormInput = {
  workshopName: string;
  fields: Record<string, string>;
  visibility: Record<string, string>;
};

export async function saveProfileAction(input: ProfileFormInput): Promise<ActionResult> {
  const user = await requireAdmin();
  const name = settingsSchema.shape.workshopName.min(1, "Vui lòng nhập tên xưởng.").safeParse(input?.workshopName);
  if (!name.success) return { error: firstIssue(name.error) };

  const data: Record<string, string | null> = {};
  const visibility: Record<string, string> = {};
  for (const f of PROFILE_FIELDS) {
    const raw = String(input?.fields?.[f.key] ?? "").trim();
    const max = FIELD_MAX[f.key] ?? 5000;
    if (raw.length > max) return { error: `${f.label} tối đa ${max.toLocaleString("vi-VN")} ký tự.` };
    data[f.key] = raw === "" ? null : raw;
    const v = input?.visibility?.[f.key];
    visibility[f.key] = isVisibility(v) ? v : "INTERNAL";
  }

  const workshopName = name.data;
  await db.$transaction([
    db.businessProfile.upsert({
      where: { id: PROFILE_ID },
      create: { id: PROFILE_ID, ...data, visibility, updatedById: user.id },
      update: { ...data, visibility, updatedById: user.id },
    }),
    db.setting.upsert({ where: { key: "workshopName" }, create: { key: "workshopName", value: workshopName }, update: { value: workshopName } }),
  ]);
  refresh();
  return { ok: "Đã lưu hồ sơ doanh nghiệp." };
}

/* ---------- Bài kiến thức ---------- */

function articleData(a: ArticleInput, userId: string) {
  return {
    title: a.title,
    category: a.category,
    body: a.body,
    visibility: a.visibility,
    tags: a.tags as Prisma.InputJsonValue,
    status: a.status,
    priority: a.priority,
    alwaysInclude: a.alwaysInclude,
    effectiveFrom: a.effectiveFrom ? parseEffectiveFrom(a.effectiveFrom) : null,
    updatedById: userId,
  };
}

export type SaveArticleResult = ActionResult & { id?: string };

/** Tạo (id = null) hoặc sửa một bài. Vai AI ghi bằng giao dịch: xóa hết rồi tạo lại. */
export async function saveArticleAction(id: string | null, form: ArticleFormInput): Promise<SaveArticleResult> {
  const user = await requireAdmin();
  const parsed = articleSchema.safeParse(formToInput(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const a = normalizeArticle(parsed.data);

  if (id === null) {
    const created = await db.knowledgeArticle.create({
      data: { ...articleData(a, user.id), roles: { create: a.roles.map((role) => ({ role })) } },
      select: { id: true },
    });
    refresh();
    return { ok: "Đã tạo bài kiến thức.", id: created.id };
  }

  const exists = await db.knowledgeArticle.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return { error: "Không tìm thấy bài này (có thể đã bị xóa)." };
  await db.$transaction([
    db.knowledgeArticle.update({ where: { id }, data: articleData(a, user.id) }),
    db.knowledgeArticleRole.deleteMany({ where: { articleId: id } }),
    db.knowledgeArticleRole.createMany({ data: a.roles.map((role) => ({ articleId: id, role })) }),
  ]);
  refresh();
  return { ok: "Đã lưu bài kiến thức.", id };
}

export async function deleteArticleAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  const r = await db.knowledgeArticle.deleteMany({ where: { id } });
  if (r.count === 0) return { error: "Không tìm thấy bài này (có thể đã bị xóa)." };
  refresh();
  return { ok: "Đã xóa bài." };
}

/* ---------- Nhập CSV ---------- */

export type ImportArticlesState = {
  error?: string;
  report?: { total: number; created: number; updated: number; errors: { line: number; message: string }[] };
};

/** Nhập CSV bài kiến thức: có id khớp thì cập nhật, không có id thì tạo bài NHÁP. Hàng lỗi được báo rõ số dòng, không dừng cả file. */
export async function importArticlesCsvAction(_prev: ImportArticlesState, formData: FormData): Promise<ImportArticlesState> {
  const user = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Vui lòng chọn file CSV." };
  if (file.size > MAX_CSV_BYTES) return { error: "File CSV quá lớn (tối đa 2MB)." };

  const parsed = parseArticlesCsv(await file.text());
  if (parsed.rows.length === 0 && parsed.errors.length > 0 && parsed.columns.length === 0) return { error: parsed.errors[0].message };
  if (parsed.rows.length + parsed.errors.length > MAX_CSV_ROWS) return { error: `File có quá nhiều dòng (tối đa ${MAX_CSV_ROWS} dòng, không tính dòng tiêu đề).` };

  const errors = [...parsed.errors];
  const ids = parsed.rows.map((r) => r.values.id).filter((x): x is string => typeof x === "string" && x.length <= 40);
  const found = ids.length
    ? await db.knowledgeArticle.findMany({ where: { id: { in: ids } }, include: { roles: { select: { role: true } } } })
    : [];
  const byId = new Map(found.map((a) => [a.id, a]));

  let created = 0;
  let updated = 0;
  for (const row of parsed.rows) {
    const rowId = row.values.id;
    let existing: ArticleInput | null = null;
    if (typeof rowId === "string") {
      const e = byId.get(rowId);
      if (!e) {
        errors.push({ line: row.line, message: `Không tìm thấy bài có id ${rowId}. Muốn tạo bài mới thì để trống ô id.` });
        continue;
      }
      existing = {
        title: e.title,
        category: e.category,
        body: e.body,
        visibility: e.visibility,
        roles: e.roles.map((r) => r.role).filter(isAiRole),
        tags: parseTagsJson(e.tags),
        status: e.status,
        priority: e.priority,
        alwaysInclude: e.alwaysInclude,
        effectiveFrom: formatEffectiveFrom(e.effectiveFrom),
      };
    }
    const r = rowToArticle(row.values, existing);
    if ("error" in r) {
      errors.push({ line: row.line, message: r.error });
      continue;
    }
    try {
      if (typeof rowId === "string") {
        await db.$transaction([
          db.knowledgeArticle.update({ where: { id: rowId }, data: articleData(r.input, user.id) }),
          db.knowledgeArticleRole.deleteMany({ where: { articleId: rowId } }),
          db.knowledgeArticleRole.createMany({ data: r.input.roles.map((role) => ({ articleId: rowId, role })) }),
        ]);
        updated++;
      } else {
        await db.knowledgeArticle.create({ data: { ...articleData(r.input, user.id), roles: { create: r.input.roles.map((role) => ({ role })) } } });
        created++;
      }
    } catch (e) {
      console.error("Nhập CSV bài kiến thức, lỗi ở dòng", row.line, e);
      errors.push({ line: row.line, message: "Không ghi được dòng này vào cơ sở dữ liệu." });
    }
  }
  errors.sort((a, b) => a.line - b.line);
  if (created + updated > 0) refresh();
  return { report: { total: parsed.rows.length + parsed.errors.length, created, updated, errors } };
}

/* ---------- Thông số tính giá ---------- */

export type PricingFormInput = { id?: string; key: string; label: string; value: string; unit: string; note: string };

const pricingSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9_.-]{0,59}$/, "Mã khóa chỉ gồm chữ không dấu, số, dấu gạch dưới, gạch ngang hoặc chấm (tối đa 60 ký tự)."),
  label: z.string().trim().min(1, "Vui lòng nhập tên thông số.").max(200, "Tên thông số tối đa 200 ký tự."),
  unit: z.string().trim().max(40, "Đơn vị tối đa 40 ký tự."),
  note: z.string().trim().max(5000, "Ghi chú tối đa 5000 ký tự."),
});

export async function savePricingParamAction(input: PricingFormInput): Promise<ActionResult> {
  const user = await requireAdmin();
  const p = pricingSchema.safeParse(input);
  if (!p.success) return { error: firstIssue(p.error) };
  const v = parsePricingValue(String(input.value ?? ""));
  if ("error" in v) return { error: v.error };

  const clash = await db.pricingParam.findUnique({ where: { key: p.data.key }, select: { id: true } });
  if (clash && clash.id !== input.id) return { error: "Mã khóa này đã có, hãy dùng mã khác." };

  const data = { key: p.data.key, label: p.data.label, value: v.value, unit: p.data.unit || null, note: p.data.note || null, updatedById: user.id };
  if (input.id) {
    const r = await db.pricingParam.updateMany({ where: { id: input.id }, data });
    if (r.count === 0) return { error: "Không tìm thấy thông số này (có thể đã bị xóa)." };
  } else {
    const last = await db.pricingParam.aggregate({ _max: { sortOrder: true } });
    await db.pricingParam.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  }
  revalidatePath("/admin/business/pricing");
  return { ok: "Đã lưu thông số." };
}

export async function deletePricingParamAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  const r = await db.pricingParam.deleteMany({ where: { id } });
  if (r.count === 0) return { error: "Không tìm thấy thông số này (có thể đã bị xóa)." };
  revalidatePath("/admin/business/pricing");
  return { ok: "Đã xóa thông số." };
}

/* ---------- Ngân sách AI ---------- */

export async function setBudgetAction(role: string, chars: number): Promise<ActionResult> {
  await requireAdmin();
  if (!isAiRole(role)) return { error: "Vai AI không hợp lệ." };
  if (!Number.isInteger(chars) || chars < 500 || chars > 60_000) return { error: "Ngân sách phải là số nguyên từ 500 đến 60.000 ký tự." };
  await setRoleBudget(role, chars);
  revalidatePath("/admin/business/articles");
  return { ok: `Đã lưu ngân sách cho "${ROLE_INFO[role].label}".` };
}

/* ---------- Thử AI ---------- */

export type TryArticle = { id: string; title: string; visibility: string };
export type TryAnswer = {
  text: string;
  unknown: boolean;
  tokens: number;
  used: TryArticle[];
  dropped: TryArticle[];
};
export type AskResult = { error?: string; answer?: TryAnswer };

/** Hỏi AI thử theo một vai (tốn token kie.ai). Chỉ admin; vai phải nằm trong danh sách, không nhận "audience" tự do. */
export async function askAiAction(role: string, question: string): Promise<AskResult> {
  const user = await requireAdmin();
  if (!isAiRole(role)) return { error: "Vai AI không hợp lệ." };
  const q = String(question ?? "").trim();
  if (!q) return { error: "Vui lòng nhập câu hỏi." };
  if (q.length > 1500) return { error: "Câu hỏi tối đa 1500 ký tự." };

  try {
    const { chatModel } = await getZaloSettings();
    const r = await answerWithKnowledge({ role: role as AiRole, model: chatModel, question: q, userId: user.id });
    const titles = await db.knowledgeArticle.findMany({
      where: { id: { in: [...r.usedIds, ...r.droppedIds] } },
      select: { id: true, title: true, visibility: true },
    });
    const byId = new Map(titles.map((t) => [t.id, t]));
    const pick = (ids: string[]): TryArticle[] =>
      ids.map((id) => byId.get(id) ?? { id, title: "(bài đã bị xóa)", visibility: "INTERNAL" });
    return { answer: { text: r.text, unknown: r.unknown, tokens: r.tokens, used: pick(r.usedIds), dropped: pick(r.droppedIds) } };
  } catch (e) {
    if (e instanceof ChatError) return { error: e.message };
    console.error("Thử AI lỗi:", e instanceof Error ? e.message : e);
    return { error: "Không hỏi được AI lúc này. Kiểm tra khóa kie.ai và tên model ở Quản trị > Zalo > Bot AI rồi thử lại." };
  }
}

/* ---------- Câu hỏi chưa trả lời được ---------- */

export async function setGapStatusAction(id: string, status: "OPEN" | "RESOLVED"): Promise<ActionResult> {
  await requireAdmin();
  if (status !== "OPEN" && status !== "RESOLVED") return { error: "Trạng thái không hợp lệ." };
  const r = await db.knowledgeGap.updateMany({ where: { id }, data: { status, ...(status === "OPEN" ? { resolvedByArticleId: null } : {}) } });
  if (r.count === 0) return { error: "Không tìm thấy câu hỏi này." };
  revalidatePath("/admin/business/gaps");
  return { ok: status === "RESOLVED" ? "Đã đánh dấu đã xử lý." : "Đã mở lại." };
}

export async function deleteGapAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  const r = await db.knowledgeGap.deleteMany({ where: { id } });
  if (r.count === 0) return { error: "Không tìm thấy câu hỏi này." };
  revalidatePath("/admin/business/gaps");
  return { ok: "Đã xóa câu hỏi." };
}
