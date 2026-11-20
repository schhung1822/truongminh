import { z } from "zod";
import { AI_ROLES, CATEGORIES, isCategory, VISIBILITIES, VISIBILITY_LABEL, type AiRole, type Visibility } from "@/lib/knowledge/roles";

/** Phần thuần (không chạm CSDL) của form bài kiến thức: kiểm tra dữ liệu, nhãn, và các hàm nhỏ dùng chung cho form, CSV và test. */

export const STATUSES = ["DRAFT", "ACTIVE", "RETIRED"] as const;
export type ArticleStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<ArticleStatus, string> = { DRAFT: "Nháp", ACTIVE: "Đang dùng", RETIRED: "Ngừng" };

/** Tên vai ngắn gọn cho bảng và nhãn. */
export const ROLE_SHORT: Record<AiRole, string> = {
  SALE_ASSISTANT: "Trợ lý sale",
  DRAFT_REPLY: "Soạn nháp",
  CARE_PLANNER: "Chăm sóc nhóm",
};

export const MAX_TITLE = 200;
export const MAX_BODY = 20_000;
export const MAX_TAGS = 20;
export const MAX_TAG_LEN = 40;

/** Chữ thường, bỏ dấu, gộp khoảng trắng: để so sánh và tìm kiếm không phân biệt dấu. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Tách danh sách theo dấu phân cách, bỏ ô trống, bỏ trùng (không phân biệt hoa thường). */
export function splitList(raw: string, sep: RegExp): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(sep)) {
    const t = part.trim().replace(/\s+/g, " ");
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export const articleSchema = z.object({
  title: z.string().trim().min(1, "Vui lòng nhập tiêu đề.").max(MAX_TITLE, `Tiêu đề tối đa ${MAX_TITLE} ký tự.`),
  category: z.string().refine(isCategory, "Danh mục không hợp lệ."),
  body: z.string().trim().min(1, "Vui lòng nhập nội dung.").max(MAX_BODY, `Nội dung tối đa ${MAX_BODY.toLocaleString("vi-VN")} ký tự.`),
  visibility: z.enum(VISIBILITIES, "Mức hiển thị không hợp lệ."),
  roles: z.array(z.enum(AI_ROLES, "Vai AI không hợp lệ.")),
  tags: z
    .array(z.string().trim().min(1).max(MAX_TAG_LEN, `Mỗi tag tối đa ${MAX_TAG_LEN} ký tự.`))
    .max(MAX_TAGS, `Tối đa ${MAX_TAGS} tag.`),
  status: z.enum(STATUSES, "Trạng thái không hợp lệ."),
  priority: z.number("Ưu tiên phải là số.").int("Ưu tiên phải là số nguyên.").min(-1000, "Ưu tiên từ -1000 đến 1000.").max(1000, "Ưu tiên từ -1000 đến 1000."),
  alwaysInclude: z.boolean(),
  /** ngày (YYYY-MM-DD) hoặc null */
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày hiệu lực không hợp lệ.")
    .refine((s) => !Number.isNaN(parseEffectiveFrom(s).getTime()), "Ngày hiệu lực không hợp lệ.")
    .nullable(),
});
export type ArticleInput = z.infer<typeof articleSchema>;

/** Dữ liệu form gửi lên: tag là một chuỗi cách nhau dấu phẩy. */
export type ArticleFormInput = Omit<ArticleInput, "tags"> & { tags: string };

export function formToInput(f: ArticleFormInput): unknown {
  return { ...f, tags: splitList(String(f.tags ?? ""), /,/), roles: [...new Set(f.roles ?? [])] };
}

/** Bài chỉ admin thì không vai AI nào được dùng: bỏ hết vai. */
export function normalizeArticle(a: ArticleInput): ArticleInput {
  return { ...a, roles: a.visibility === "ADMIN_ONLY" ? [] : [...new Set(a.roles)] };
}

/** Ngày hiệu lực tính từ 0 giờ giờ Việt Nam. */
export function parseEffectiveFrom(s: string): Date {
  return new Date(`${s}T00:00:00+07:00`);
}

export function formatEffectiveFrom(d: Date | null | undefined): string | null {
  if (!d) return null;
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

export function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Dữ liệu không hợp lệ.";
}

export const VISIBILITY_OPTIONS = VISIBILITIES.map((v) => ({ value: v, label: VISIBILITY_LABEL[v] as string }));
export const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s as string, label: STATUS_LABEL[s] }));
export const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c.key, label: c.label }));

export function parseTagsJson(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [];
}

export type { Visibility };
