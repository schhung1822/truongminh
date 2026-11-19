import {
  CONFIDENCE_LEVELS,
  foldKey,
  optionLabel,
  PHOTO_ISSUES,
  resolveOption,
  type OptionRow,
  type OptionType,
} from "./option-types";

/**
 * Chuẩn hóa các trường phân loại chất liệu (từ form hoặc từ CSV) thành dữ liệu sẵn sàng ghi CSDL.
 * Mỗi trường trong `patch`: chuỗi = đặt giá trị, null = xóa, undefined = giữ nguyên (không đụng tới).
 * File này thuần (không đụng CSDL) để test dễ và dùng chung cho form lẫn nhập CSV.
 */
export type ClassifyPatch = {
  baseMaterial?: string | null;
  technique?: string | null;
  surfaceFinish?: string | null;
  surfacePattern?: string | null;
  colorCount?: string | null;
  frontColorName?: string | null;
  frontColorFamily?: string | null;
  frontColorConfidence?: string | null;
  backColorName?: string | null;
  backColorFamily?: string | null;
  backColorConfidence?: string | null;
  seriesCode?: string | null;
  styleTags?: string[] | string | null;
  aiVisualNote?: string | null;
  photoIssue?: string[] | string | null;
  classifyConfidence?: string | null;
  needsReview?: string | boolean | null;
  reviewNote?: string | null;
};

/** Giá trị hiện có của chất liệu đang sửa: giá trị đã bị tắt trong danh mục vẫn được giữ nguyên. */
export type ClassifyCurrent = {
  [K in Exclude<keyof ClassifyPatch, "styleTags" | "photoIssue" | "needsReview">]?: string | null;
} & { styleTags?: string[] };

export type ClassifyResult = {
  /** các cột của bảng materials cần ghi (chỉ những trường có trong patch), gồm cả groupName/printTech ghi song song */
  scalar: Record<string, string | boolean | null>;
  /** danh sách tag phong cách mới (undefined = không đổi) */
  styleTags?: string[];
  errors: string[];
};

type OptionKey = "baseMaterial" | "technique" | "surfaceFinish" | "surfacePattern" | "frontColorFamily" | "backColorFamily" | "seriesCode";
const OPTION_FIELDS: { field: OptionKey; type: OptionType; label: string }[] = [
  { field: "baseMaterial", type: "BASE_MATERIAL", label: "Nhóm chất liệu" },
  { field: "technique", type: "TECHNIQUE", label: "Công nghệ in" },
  { field: "surfaceFinish", type: "SURFACE_FINISH", label: "Chất bề mặt" },
  { field: "surfacePattern", type: "SURFACE_PATTERN", label: "Họa tiết" },
  { field: "frontColorFamily", type: "COLOR_FAMILY", label: "Họ màu mặt trước" },
  { field: "backColorFamily", type: "COLOR_FAMILY", label: "Họ màu mặt sau" },
  { field: "seriesCode", type: "SERIES", label: "Dòng nhà cung cấp" },
];

const CONFIDENCE_FIELDS: { field: keyof ClassifyPatch; label: string }[] = [
  { field: "frontColorConfidence", label: "Độ tin cậy màu mặt trước" },
  { field: "backColorConfidence", label: "Độ tin cậy màu mặt sau" },
  { field: "classifyConfidence", label: "Độ tin cậy phân loại" },
];

const NAME_LIMIT = 100;
const NOTE_LIMIT = 2000;

/** "1", "1 màu", "ONE", "một" -> ONE; "2", "2 màu", "TWO", "hai" -> TWO. */
export function parseColorCount(input: string): "ONE" | "TWO" | null {
  const k = foldKey(input);
  if (["1", "1mau", "one", "mot", "motmau"].includes(k)) return "ONE";
  if (["2", "2mau", "two", "hai", "haimau"].includes(k)) return "TWO";
  return null;
}

export function parseBoolean(input: string | boolean): boolean | null {
  if (typeof input === "boolean") return input;
  const k = foldKey(input);
  if (["true", "1", "co", "yes", "x", "y"].includes(k)) return true;
  if (["false", "0", "khong", "no", "n"].includes(k)) return false;
  return null;
}

function toList(v: string[] | string): string[] {
  const parts = Array.isArray(v) ? v : v.split(/[|;,]/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function normalizeClassification(patch: ClassifyPatch, options: OptionRow[], current: ClassifyCurrent = {}): ClassifyResult {
  const scalar: ClassifyResult["scalar"] = {};
  const errors: string[] = [];

  for (const { field, type, label } of OPTION_FIELDS) {
    const v = patch[field];
    if (v === undefined) continue;
    if (v === null || v.trim() === "") {
      scalar[field] = null;
      continue;
    }
    const value = resolveOption(options, type, v, current[field]);
    if (!value) {
      errors.push(`${label}: "${v}" không có trong danh mục (hoặc đã bị tắt).`);
      continue;
    }
    scalar[field] = value;
  }
  // Ghi song song hai cột cũ để mọi nơi đang đọc groupName/printTech (nhãn ảnh, prompt, bot Zalo...) vẫn đúng
  if (typeof scalar.baseMaterial === "string") scalar.groupName = optionLabel(options, "BASE_MATERIAL", scalar.baseMaterial);
  if (typeof scalar.technique === "string") scalar.printTech = optionLabel(options, "TECHNIQUE", scalar.technique);

  if (patch.colorCount !== undefined) {
    if (patch.colorCount === null || patch.colorCount.trim() === "") scalar.colorCount = null;
    else {
      const c = parseColorCount(patch.colorCount);
      if (!c) errors.push(`Số màu: "${patch.colorCount}" không hợp lệ (chọn 1 màu hoặc 2 màu).`);
      else scalar.colorCount = c;
    }
  }

  for (const [field, label] of [["frontColorName", "Tên màu mặt trước"], ["backColorName", "Tên màu mặt sau"]] as const) {
    const v = patch[field];
    if (v === undefined) continue;
    const t = (v ?? "").trim();
    if (t.length > NAME_LIMIT) errors.push(`${label} tối đa ${NAME_LIMIT} ký tự.`);
    else scalar[field] = t || null;
  }
  for (const [field, label, limit] of [["aiVisualNote", "Mô tả cho AI", 1000], ["reviewNote", "Ghi chú xem lại", NOTE_LIMIT]] as const) {
    const v = patch[field];
    if (v === undefined) continue;
    const t = (v ?? "").trim();
    if (t.length > limit) errors.push(`${label} tối đa ${limit} ký tự.`);
    else scalar[field] = t || null;
  }

  for (const { field, label } of CONFIDENCE_FIELDS) {
    const v = patch[field] as string | null | undefined;
    if (v === undefined) continue;
    if (v === null || v.trim() === "") {
      scalar[field] = null;
      continue;
    }
    const k = foldKey(v);
    const found = CONFIDENCE_LEVELS.find((c) => foldKey(c.value) === k || foldKey(c.label) === k);
    if (!found) errors.push(`${label}: "${v}" không hợp lệ (CAO, TRUNG_BINH hoặc THAP).`);
    else scalar[field] = found.value;
  }

  if (patch.photoIssue !== undefined) {
    const list = patch.photoIssue === null ? [] : toList(patch.photoIssue);
    const out = new Set<string>();
    for (const item of list) {
      const k = foldKey(item);
      const found = PHOTO_ISSUES.find((p) => foldKey(p.value) === k || foldKey(p.label) === k);
      if (!found) errors.push(`Vấn đề ảnh: "${item}" không hợp lệ.`);
      else out.add(found.value);
    }
    const ordered = PHOTO_ISSUES.map((p) => p.value).filter((v) => out.has(v));
    scalar.photoIssue = ordered.length ? ordered.join("|") : null;
  }

  if (patch.needsReview !== undefined) {
    if (patch.needsReview === null || (typeof patch.needsReview === "string" && patch.needsReview.trim() === "")) scalar.needsReview = false;
    else {
      const b = parseBoolean(patch.needsReview);
      if (b === null) errors.push(`Cần xem lại: "${patch.needsReview}" không hợp lệ (TRUE hoặc FALSE).`);
      else scalar.needsReview = b;
    }
  }

  let styleTags: string[] | undefined;
  if (patch.styleTags !== undefined) {
    const list = patch.styleTags === null ? [] : toList(patch.styleTags);
    const keep = new Set(current.styleTags ?? []);
    const out: string[] = [];
    for (const item of list) {
      let value = resolveOption(options, "STYLE_TAG", item);
      if (!value) {
        // tag đã bị tắt nhưng chất liệu này đang dùng thì giữ lại
        const asKept = resolveOption(options.map((o) => ({ ...o, isActive: true })), "STYLE_TAG", item);
        if (asKept && keep.has(asKept)) value = asKept;
      }
      if (!value) errors.push(`Phong cách: "${item}" không có trong danh mục (hoặc đã bị tắt).`);
      else if (!out.includes(value)) out.push(value);
    }
    styleTags = out;
  }

  return { scalar, styleTags, errors };
}

/** Các cột phân loại bắt buộc khi lưu từ form: nhóm chất liệu và công nghệ in. */
export function requireBasics(scalar: ClassifyResult["scalar"], current: { baseMaterial?: string | null; technique?: string | null } = {}): string[] {
  const errs: string[] = [];
  const base = "baseMaterial" in scalar ? scalar.baseMaterial : current.baseMaterial;
  const tech = "technique" in scalar ? scalar.technique : current.technique;
  if (!base) errs.push("Vui lòng chọn nhóm chất liệu.");
  if (!tech) errs.push("Vui lòng chọn công nghệ in.");
  return errs;
}
