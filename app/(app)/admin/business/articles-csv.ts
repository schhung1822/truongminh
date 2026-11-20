import { CSV_CLEAR_TOKEN, parseCsv } from "@/lib/csv/materials";
import { AI_ROLES, CATEGORIES, VISIBILITIES, VISIBILITY_LABEL, ROLE_INFO, type AiRole } from "@/lib/knowledge/roles";
import { csvLine } from "@/lib/stats/csv";
import {
  articleSchema,
  firstIssue,
  fold,
  formatEffectiveFrom,
  normalizeArticle,
  ROLE_SHORT,
  splitList,
  STATUS_LABEL,
  STATUSES,
  type ArticleInput,
} from "./article-schema";

/** CSV bài kiến thức: dựng file xuất và đọc file nhập. Phần thuần, có test. */

export const ARTICLE_CSV_COLUMNS = [
  "id", "title", "category", "visibility", "status", "roles", "tags", "priority", "alwaysInclude", "effectiveFrom", "body",
] as const;
export type ArticleCsvField = (typeof ARTICLE_CSV_COLUMNS)[number];

export const MAX_CSV_ROWS = 500;
export const MAX_CSV_BYTES = 2 * 1024 * 1024;

const HEADER_ALIASES: Record<ArticleCsvField, string[]> = {
  id: ["id"],
  title: ["title", "tieude", "ten"],
  category: ["category", "danhmuc"],
  visibility: ["visibility", "muchienthi", "muc"],
  status: ["status", "trangthai"],
  roles: ["roles", "vai", "vaiai"],
  tags: ["tags", "tag", "nhan"],
  priority: ["priority", "uutien"],
  alwaysInclude: ["alwaysinclude", "luonkem"],
  effectiveFrom: ["effectivefrom", "ngayhieuluc", "hieuluctu"],
  body: ["body", "noidung"],
};

function normalizeHeader(h: string): string {
  return fold(h).replace(/[^a-z0-9]/g, "");
}

/** Dòng của một bài để xuất CSV (đã bỏ phần không cần). */
export type ExportArticle = {
  id: string;
  title: string;
  category: string;
  visibility: string;
  status: string;
  roles: string[];
  tags: string[];
  priority: number;
  alwaysInclude: boolean;
  effectiveFrom: Date | null;
  body: string;
};

/** CSV toàn bộ bài (có BOM để Excel mở đúng tiếng Việt). Nhập lại được ngay ở chế độ cập nhật. */
export function buildArticlesCsv(rows: ExportArticle[]): string {
  const lines = [csvLine([...ARTICLE_CSV_COLUMNS])];
  for (const a of rows) {
    lines.push(
      csvLine([
        a.id,
        a.title,
        a.category,
        a.visibility,
        a.status,
        a.roles.join("|"),
        a.tags.join("|"),
        a.priority,
        a.alwaysInclude ? "TRUE" : "FALSE",
        formatEffectiveFrom(a.effectiveFrom) ?? "",
        a.body,
      ]),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** undefined = giữ nguyên, null = xóa ("[xoa]"), chuỗi = đặt giá trị. */
export type CsvCell = string | null | undefined;
export type ArticleCsvValues = Partial<Record<ArticleCsvField, CsvCell>>;
export type ArticleCsvRow = { line: number; values: ArticleCsvValues };
export type ArticleCsvParse = { rows: ArticleCsvRow[]; errors: { line: number; message: string }[]; columns: ArticleCsvField[] };

/**
 * Đọc file CSV bài kiến thức. `line` là số dòng của bảng tính (dòng 1 là tiêu đề), không phải số dòng chữ trong file
 * (nội dung bài có thể xuống dòng nhiều lần trong một ô).
 */
export function parseArticlesCsv(text: string): ArticleCsvParse {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: "File rỗng." }], columns: [] };

  const header = table[0].map(normalizeHeader);
  const index: Partial<Record<ArticleCsvField, number>> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [ArticleCsvField, string[]][]) {
    const i = header.findIndex((h) => aliases.includes(h));
    if (i >= 0) index[field] = i;
  }
  if (index.id === undefined && index.title === undefined) {
    return { rows: [], errors: [{ line: 1, message: 'Dòng đầu tiên phải có tiêu đề cột, ít nhất gồm "id" hoặc "title".' }], columns: [] };
  }
  const columns = Object.keys(index) as ArticleCsvField[];

  const rows: ArticleCsvRow[] = [];
  const errors: ArticleCsvParse["errors"] = [];
  const seen = new Set<string>();
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const values: ArticleCsvValues = {};
    for (const field of columns) {
      // csvCell của hệ thống thêm dấu ' trước ô bắt đầu bằng = + - @ để Excel không chạy công thức; bỏ dấu đó khi nhập lại
      const raw = (cells[index[field]!] ?? "").replace(/^'(?=[=+\-@\t\r])/, "").trim();
      if (raw === "") continue;
      values[field] = raw.toLowerCase() === CSV_CLEAR_TOKEN ? null : raw;
    }
    const id = values.id ?? "";
    if (id) {
      if (seen.has(id)) return errors.push({ line, message: `id ${id} bị lặp trong file.` });
      seen.add(id);
    }
    rows.push({ line, values });
  });
  return { rows, errors, columns };
}

function matchOption<T extends string>(raw: string, options: { value: T; labels: string[] }[]): T | null {
  const f = fold(raw);
  for (const o of options) if (fold(o.value) === f || o.labels.some((l) => fold(l) === f)) return o.value;
  return null;
}

const CATEGORY_OPTS = CATEGORIES.map((c) => ({ value: c.key, labels: [c.label] }));
const VISIBILITY_OPTS = VISIBILITIES.map((v) => ({ value: v, labels: [VISIBILITY_LABEL[v], v.replace("_", " ")] }));
const STATUS_OPTS = STATUSES.map((s) => ({ value: s, labels: [STATUS_LABEL[s]] }));
const ROLE_OPTS = AI_ROLES.map((r) => ({ value: r, labels: [ROLE_SHORT[r], ROLE_INFO[r].label] }));

/** Bài đang có trong CSDL, ở dạng đầu vào của form. */
export type ExistingArticle = ArticleInput;

const NEW_DEFAULTS: ArticleInput = {
  title: "",
  category: "",
  body: "",
  visibility: "INTERNAL",
  roles: [],
  tags: [],
  status: "DRAFT",
  priority: 0,
  alwaysInclude: false,
  effectiveFrom: null,
};

function parseBool(raw: string): boolean | null {
  const f = fold(raw);
  if (["true", "1", "yes", "co", "x"].includes(f)) return true;
  if (["false", "0", "no", "khong"].includes(f)) return false;
  return null;
}

function parseDate(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const vn = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vn) return `${vn[3]}-${vn[2].padStart(2, "0")}-${vn[1].padStart(2, "0")}`;
  return null;
}

/**
 * Ghép một hàng CSV vào bài hiện có (cập nhật) hoặc vào giá trị mặc định (tạo mới), rồi kiểm tra.
 * Ô trống = giữ nguyên, ô "[xoa]" = xóa (vai, tag, ngày hiệu lực). Bài mới luôn là NHÁP, mức mặc định NỘI BỘ.
 */
export function rowToArticle(values: ArticleCsvValues, existing: ExistingArticle | null): { input: ArticleInput } | { error: string } {
  const a: ArticleInput = existing ? { ...existing, roles: [...existing.roles], tags: [...existing.tags] } : { ...NEW_DEFAULTS };

  if (values.title) a.title = values.title;
  if (values.body) a.body = values.body;

  if (values.category) {
    const c = matchOption(values.category, CATEGORY_OPTS);
    if (!c) return { error: `Danh mục "${values.category}" không có trong danh sách.` };
    a.category = c;
  }
  if (values.visibility) {
    const v = matchOption(values.visibility, VISIBILITY_OPTS);
    if (!v) return { error: `Mức hiển thị "${values.visibility}" không hợp lệ (PUBLIC, INTERNAL hoặc ADMIN_ONLY).` };
    a.visibility = v;
  }
  if (existing && values.status) {
    const s = matchOption(values.status, STATUS_OPTS);
    if (!s) return { error: `Trạng thái "${values.status}" không hợp lệ (DRAFT, ACTIVE hoặc RETIRED).` };
    a.status = s;
  }
  if (values.roles === null) a.roles = [];
  else if (values.roles) {
    const roles: AiRole[] = [];
    for (const part of splitList(values.roles, /[|;]/)) {
      const r = matchOption(part, ROLE_OPTS);
      if (!r) return { error: `Vai AI "${part}" không hợp lệ (SALE_ASSISTANT, DRAFT_REPLY, CARE_PLANNER).` };
      if (!roles.includes(r)) roles.push(r);
    }
    a.roles = roles;
  }
  if (values.tags === null) a.tags = [];
  else if (values.tags) a.tags = splitList(values.tags, /\|/);
  if (values.priority) {
    const n = Number(values.priority);
    if (!Number.isInteger(n)) return { error: `Ưu tiên "${values.priority}" phải là số nguyên.` };
    a.priority = n;
  }
  if (values.alwaysInclude) {
    const b = parseBool(values.alwaysInclude);
    if (b === null) return { error: `"luôn kèm" phải là TRUE hoặc FALSE (đang là "${values.alwaysInclude}").` };
    a.alwaysInclude = b;
  }
  if (values.effectiveFrom === null) a.effectiveFrom = null;
  else if (values.effectiveFrom) {
    const d = parseDate(values.effectiveFrom);
    if (!d) return { error: `Ngày hiệu lực "${values.effectiveFrom}" không hợp lệ (dùng dạng 2026-12-31).` };
    a.effectiveFrom = d;
  }

  if (!existing) a.status = "DRAFT";
  if (!a.category) return { error: "Thiếu danh mục." };

  const parsed = articleSchema.safeParse(a);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  return { input: normalizeArticle(parsed.data) };
}
