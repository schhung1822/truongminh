/**
 * Soạn câu trả lời từ mẫu và kiểm tra câu do AI soạn (v1.0 mục 6.3, v1.1 mục 4.2). Hàm thuần, không CSDL, không mạng.
 *
 * Biến trong mẫu: {ten} tên người comment, {ten_page} tên fanpage, {link_page} link fanpage, {san_pham} sản phẩm của bài,
 * {vat_lieu_goi_y} một hoặc hai vật liệu gợi ý của bài.
 */
import { extractContacts, fold } from "./phone";

export type TemplatePurpose = "FIND_CUSTOMER" | "FIND_SUPPLIER";
export type TemplateCategory = "INTEREST" | "QUESTION" | "SUPPLIER_OFFER";

/** Các cặp (mục đích bài, loại câu) hệ thống có dùng. Bài tìm nhà sản xuất chỉ có câu mời dùng vật liệu. */
export const TEMPLATE_KINDS: { purpose: TemplatePurpose; category: TemplateCategory; label: string }[] = [
  { purpose: "FIND_SUPPLIER", category: "SUPPLIER_OFFER", label: "Bài tìm nhà sản xuất · Mời dùng vật liệu" },
  { purpose: "FIND_CUSTOMER", category: "INTEREST", label: "Bài tìm khách · Khách quan tâm (ib, xin giá)" },
  { purpose: "FIND_CUSTOMER", category: "QUESTION", label: "Bài tìm khách · Khách hỏi" },
];

export function isTemplateKind(purpose: string, category: string): boolean {
  return TEMPLATE_KINDS.some((k) => k.purpose === purpose && k.category === category);
}

export const TEMPLATE_VARS = ["ten", "ten_page", "link_page", "san_pham", "vat_lieu_goi_y"] as const;
export type TemplateVar = (typeof TEMPLATE_VARS)[number];
export type TemplateValues = Partial<Record<TemplateVar, string>>;

/** Chữ dùng khi bài chưa ghi sản phẩm / chưa chọn vật liệu gợi ý, để câu vẫn đọc được. */
export const NO_PRODUCT = "mẫu này";
export const NO_MATERIAL = "vật liệu phù hợp";

/** Mẫu có sẵn, dùng khi chưa có mẫu nào đang bật trong CSDL; trang Mẫu câu có nút nạp các mẫu này để sửa. */
export const DEFAULT_TEMPLATES: { purpose: TemplatePurpose; category: TemplateCategory; text: string }[] = [
  {
    purpose: "FIND_SUPPLIER",
    category: "SUPPLIER_OFFER",
    text: "Dạ chào {ten}, bên em là {ten_page} chuyên cung cấp vật liệu làm logo, nhãn cho xưởng may; với {san_pham} xưởng mình có thể tham khảo {vat_lieu_goi_y}. Anh/chị nhắn page giúp em để em gửi bảng mẫu nhé.",
  },
  {
    purpose: "FIND_SUPPLIER",
    category: "SUPPLIER_OFFER",
    text: "Chào {ten}, em bên {ten_page}, đơn vị cung cấp vật liệu làm logo cho các xưởng. Với {san_pham}, bên em gợi ý {vat_lieu_goi_y}; xưởng cần mẫu thử thì nhắn page, em gửi ngay ạ.",
  },
  {
    purpose: "FIND_CUSTOMER",
    category: "INTEREST",
    text: "Dạ em chào {ten}, em đã nhận thông tin ạ. Anh/chị nhắn giúp em vào page {ten_page} để em gửi mẫu và báo giá chi tiết nhé.",
  },
  {
    purpose: "FIND_CUSTOMER",
    category: "INTEREST",
    text: "Chào {ten}, cảm ơn anh/chị đã quan tâm. Anh/chị inbox page {ten_page} giúp em, bên em tư vấn và báo giá ngay ạ.",
  },
  {
    purpose: "FIND_CUSTOMER",
    category: "QUESTION",
    text: "Dạ chào {ten}, phần này em cần thêm vài thông tin để trả lời chính xác. Anh/chị nhắn page {ten_page} giúp em, em phản hồi ngay ạ.",
  },
];

const clean = (s: string) => s.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

/**
 * Thay biến trong mẫu. Biến không có giá trị thì thay bằng chuỗi rỗng rồi dọn khoảng trắng và dấu câu thừa
 * ("page  để" -> "page để", "( )" bị bỏ), để câu không lộ dấu ngoặc nhọn ra ngoài.
 */
export function renderTemplate(template: string, values: TemplateValues): string {
  const out = template.replace(/\{([a-z_]+)\}/g, (whole, name: string) => ((TEMPLATE_VARS as readonly string[]).includes(name) ? (values[name as TemplateVar] ?? "").trim() : whole));
  return clean(
    out
      .replace(/\(\s*\)/g, "")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/,\s*,/g, ","),
  );
}

/** Các biến lạ trong mẫu (gõ sai tên), để trang Mẫu câu báo ngay lúc lưu. */
export function unknownVars(template: string): string[] {
  const found = [...template.matchAll(/\{([^{}\s]+)\}/g)].map((m) => m[1]);
  return [...new Set(found.filter((n) => !(TEMPLATE_VARS as readonly string[]).includes(n)))];
}

export type OfferMaterial = { name: string; kind?: string | null };

/** Cụm "vật liệu gợi ý" cho câu trả lời: đúng 1-2 vật liệu đầu danh sách của bài, không liệt kê dài (v1.1 mục 4.2). */
export function materialPhrase(materials: OfferMaterial[]): string {
  const picked = materials.slice(0, 2).filter((m) => m.name.trim());
  if (picked.length === 0) return NO_MATERIAL;
  const kinds = picked.map((m) => (m.kind ?? "").trim().toLowerCase());
  // Hai vật liệu cùng loại thì ghi loại một lần ở cuối, cho câu gọn
  if (kinds.every((k) => k === kinds[0])) return `${picked.map((m) => m.name.trim()).join(" hoặc ")}${kinds[0] ? ` (${kinds[0]})` : ""}`;
  return picked.map((m, i) => (kinds[i] ? `${m.name.trim()} (${kinds[i]})` : m.name.trim())).join(" hoặc ");
}

/**
 * Chọn mẫu kế tiếp theo vòng tròn: mẫu đứng ngay sau mẫu vừa dùng ở comment trước trong cùng bài. Có từ hai mẫu trở lên thì
 * hai comment liền nhau không bao giờ dùng chung một mẫu. Danh sách phải có thứ tự ổn định (theo ngày tạo).
 */
export function pickNextTemplate<T extends { id: string }>(templates: T[], lastTemplateId: string | null): T | null {
  if (templates.length === 0) return null;
  const at = lastTemplateId ? templates.findIndex((t) => t.id === lastTemplateId) : -1;
  return templates[(at + 1) % templates.length];
}

/** So hai câu có phải cùng nguyên văn không (bỏ dấu, hoa thường, khoảng trắng và dấu câu). */
export function sameWording(a: string, b: string): boolean {
  const norm = (s: string) => fold(s).replace(/[^a-z0-9]+/g, " ").trim();
  return norm(a) === norm(b);
}

/** Câu có chứa một trong các số điện thoại đã cho không (viết kiểu nào cũng nhận ra, vì dùng chung bộ tách số). */
export function mentionsPhone(text: string, phones: string[]): boolean {
  if (phones.length === 0) return false;
  const found = extractContacts(text).phones;
  return found.some((p) => phones.includes(p));
}

/** Che số điện thoại và email trước khi đưa nội dung comment cho AI: AI không cần chúng để phân loại hay soạn câu. */
export function maskContacts(text: string): string {
  const c = extractContacts(text);
  let out = text;
  for (const email of c.emails) out = out.replace(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[email]");
  // Số có thể viết kèm dấu chấm, cách, +84: thay mọi cụm giống số điện thoại dài từ 9 chữ số
  out = out.replace(/(?<![A-Za-z0-9])\+?[0-9oOlI](?:[0-9oOlI .\-_()]*[0-9oOlI])?(?![A-Za-z0-9])/g, (m) => (extractContacts(m).phones.length > 0 ? "[số điện thoại]" : m));
  return out;
}

/** Số câu, đếm theo dấu kết câu. "nhé." và "ạ!" đều là một câu; dấu ba chấm tính một lần. */
export function sentenceCount(text: string): number {
  const parts = text.split(/(?:[.!?…]+)(?:\s+|$)/).map((p) => p.trim()).filter(Boolean);
  return Math.max(1, parts.length);
}

export type DraftCheck = { ok: true } | { ok: false; reason: string };

/**
 * Kiểm tra câu do AI soạn theo quy tắc của v1.1 mục 4.2. Câu không đạt thì hệ thống giữ câu soạn từ mẫu.
 * - 1-2 câu (cho phép tới 3 vì AI hay tách lời chào thành một câu riêng), không quá dài.
 * - Có tên fanpage.
 * - Nhắc ít nhất một vật liệu gợi ý của bài (nếu bài có chọn).
 * - Không nhắc lại số điện thoại của người comment.
 * - Không trùng nguyên văn một câu đã soạn / đã gửi trong cùng bài.
 */
export function checkAiDraft(draft: string, ctx: { pageName: string | null; materialNames: string[]; commenterPhones: string[]; usedTexts: string[] }): DraftCheck {
  const text = draft.trim();
  if (text.length < 20) return { ok: false, reason: "quá ngắn" };
  if (text.length > 450) return { ok: false, reason: "quá dài" };
  if (/\{[a-z_]+\}/.test(text)) return { ok: false, reason: "còn biến chưa thay" };
  if (sentenceCount(text) > 3) return { ok: false, reason: "dài hơn 2 câu" };
  if (ctx.pageName && !fold(text).includes(fold(ctx.pageName).trim())) return { ok: false, reason: "thiếu tên fanpage" };
  if (ctx.materialNames.length > 0 && !ctx.materialNames.some((n) => n.trim() && fold(text).includes(fold(n).trim()))) return { ok: false, reason: "không nhắc vật liệu gợi ý của bài" };
  if (mentionsPhone(text, ctx.commenterPhones)) return { ok: false, reason: "nhắc lại số điện thoại của người comment" };
  if (/(?:https?:\/\/|www\.)/i.test(text)) return { ok: false, reason: "có đường link" };
  if (ctx.usedTexts.some((u) => sameWording(u, text))) return { ok: false, reason: "trùng nguyên văn câu đã dùng trong bài" };
  return { ok: true };
}
