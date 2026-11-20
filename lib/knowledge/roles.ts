/**
 * Vai AI, mức hiển thị và danh mục của kho kiến thức. Thuần (không chạm CSDL) để dùng cả trong web lẫn test.
 *
 * Nguyên tắc: bot KHÔNG tự nói chuyện với khách. Mọi AI chỉ làm việc cho nhân viên đã ghép nối:
 *  - SALE_ASSISTANT: nhân viên tag bot hỏi kỹ thuật, bot trả lời cho nhân viên.
 *  - DRAFT_REPLY: AI soạn nháp trả lời khách, nhân viên duyệt rồi tự gửi.
 *  - CARE_PLANNER: AI lên kịch bản bài đăng nhóm, nhân viên chỉnh rồi mới đăng.
 * Hai vai sau tạo ra chữ đi tới khách nên chỉ được đọc kiến thức CÔNG KHAI.
 * Mức ADMIN_ONLY không vai nào được đọc.
 */

export const VISIBILITIES = ["PUBLIC", "INTERNAL", "ADMIN_ONLY"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  PUBLIC: "Công khai",
  INTERNAL: "Nội bộ",
  ADMIN_ONLY: "Chỉ admin",
};

export const AI_ROLES = ["SALE_ASSISTANT", "DRAFT_REPLY", "CARE_PLANNER"] as const;
export type AiRole = (typeof AI_ROLES)[number];

/** CUSTOMER = chữ do AI viết sẽ tới khách; SALE = chỉ nhân viên đọc. */
export type Audience = "CUSTOMER" | "SALE";

export type RoleInfo = {
  label: string;
  desc: string;
  audience: Audience;
  /** số ký tự kiến thức (hồ sơ + bài) tối đa đưa vào prompt */
  budgetChars: number;
  /** số chất liệu tối đa đưa vào prompt */
  materialsLimit: number;
};

export const ROLE_INFO: Record<AiRole, RoleInfo> = {
  SALE_ASSISTANT: {
    label: "Trợ lý cho sale (tag bot hỏi kỹ thuật)",
    desc: "Nhân viên đã ghép nối tag bot trong nhóm hoặc nhắn riêng để hỏi kỹ thuật. Câu trả lời chỉ nhân viên đọc.",
    audience: "SALE",
    budgetChars: 10_000,
    materialsLimit: 120,
  },
  DRAFT_REPLY: {
    label: "AI soạn nháp trả lời khách",
    desc: "Nút “AI soạn” trong Hộp thư: nháp để nhân viên đọc, chỉnh rồi tự gửi cho khách.",
    audience: "CUSTOMER",
    budgetChars: 6_000,
    materialsLimit: 80,
  },
  CARE_PLANNER: {
    label: "Kịch bản chăm sóc nhóm",
    desc: "AI lên kịch bản bài đăng nhóm khách, nhân viên chỉnh rồi mới đăng.",
    audience: "CUSTOMER",
    budgetChars: 3_000,
    materialsLimit: 60,
  },
};

export const isAiRole = (v: unknown): v is AiRole => typeof v === "string" && (AI_ROLES as readonly string[]).includes(v);
export const isVisibility = (v: unknown): v is Visibility => typeof v === "string" && (VISIBILITIES as readonly string[]).includes(v);

/** Các mức hiển thị một vai được phép đọc. KHÔNG BAO GIỜ có ADMIN_ONLY. */
export function visibilitiesFor(role: AiRole): Visibility[] {
  return ROLE_INFO[role].audience === "SALE" ? ["PUBLIC", "INTERNAL"] : ["PUBLIC"];
}

/** Lớp kiểm tra thứ hai sau câu truy vấn: bài (đã tải lên) có được vai này đọc không. */
export function isVisibleTo(role: AiRole, article: { visibility: string; roles: string[] }): boolean {
  return (
    isVisibility(article.visibility) &&
    visibilitiesFor(role).includes(article.visibility) &&
    article.roles.includes(role)
  );
}

export type CategoryInfo = {
  key: string;
  label: string;
  /** mức hiển thị gợi ý khi tạo bài mới trong danh mục này */
  visibility: Visibility;
  /** vai AI gợi ý khi tạo bài mới */
  roles: AiRole[];
  hint: string;
};

export const CATEGORIES: CategoryInfo[] = [
  { key: "dich-vu", label: "Dịch vụ và sản phẩm làm được", visibility: "PUBLIC", roles: ["SALE_ASSISTANT", "DRAFT_REPLY", "CARE_PLANNER"], hint: "Móc khóa, nhãn mác, patch, huy hiệu... làm được và không làm được." },
  { key: "cong-nghe", label: "Công nghệ sản xuất", visibility: "INTERNAL", roles: ["SALE_ASSISTANT"], hint: "Từng công nghệ: làm được gì, không làm được gì, hợp chất liệu nào." },
  { key: "thong-so", label: "Thông số kỹ thuật", visibility: "INTERNAL", roles: ["SALE_ASSISTANT"], hint: "Kích thước, nét mảnh nhất, chữ nhỏ nhất, số màu, dung sai." },
  { key: "don-hang", label: "Đơn hàng", visibility: "PUBLIC", roles: ["SALE_ASSISTANT", "DRAFT_REPLY"], hint: "Số lượng tối thiểu, thời gian sản xuất, làm mẫu thử." },
  { key: "gia", label: "Giá và báo giá", visibility: "INTERNAL", roles: ["SALE_ASSISTANT"], hint: "Cách báo giá, giá niêm yết (nếu công khai), đặt cọc." },
  { key: "giao-hang", label: "Giao hàng, đổi trả, bảo hành", visibility: "PUBLIC", roles: ["SALE_ASSISTANT", "DRAFT_REPLY"], hint: "Giao hàng, đổi trả, bảo hành, xử lý lỗi, khiếu nại." },
  { key: "file-thiet-ke", label: "File thiết kế", visibility: "PUBLIC", roles: ["SALE_ASSISTANT", "DRAFT_REPLY"], hint: "Khách gửi file gì, định dạng nào, có vẽ lại logo không." },
  { key: "faq", label: "Câu hỏi thường gặp", visibility: "PUBLIC", roles: ["SALE_ASSISTANT", "DRAFT_REPLY"], hint: "Mỗi bài một câu hỏi và câu trả lời mẫu." },
  { key: "kich-ban", label: "Kịch bản tư vấn và xử lý từ chối", visibility: "INTERNAL", roles: ["SALE_ASSISTANT"], hint: "Cách nói với khách khi chê giá, so sánh, cần gấp." },
  { key: "bao-quan", label: "Bảo quản, cách dùng sản phẩm", visibility: "PUBLIC", roles: ["SALE_ASSISTANT", "DRAFT_REPLY", "CARE_PLANNER"], hint: "Bảo quản, vệ sinh, điều làm hỏng sản phẩm." },
  { key: "cham-soc", label: "Nội dung bài đăng chăm sóc nhóm", visibility: "PUBLIC", roles: ["CARE_PLANNER"], hint: "Điều muốn nhấn mạnh, khuyến mãi được nói công khai, giọng điệu." },
  { key: "khac", label: "Khác", visibility: "INTERNAL", roles: ["SALE_ASSISTANT"], hint: "" },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
export const categoryInfo = (key: string): CategoryInfo => CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
export const isCategory = (v: unknown): v is string => typeof v === "string" && CATEGORY_KEYS.includes(v);

/** Các trường của hồ sơ doanh nghiệp (tên xưởng nằm ở bảng settings, không nằm ở đây). */
export const PROFILE_FIELDS = [
  { key: "tradeName", label: "Tên giao dịch", multiline: false },
  { key: "intro", label: "Giới thiệu ngắn", multiline: true },
  { key: "address", label: "Địa chỉ", multiline: true },
  { key: "hours", label: "Giờ làm việc", multiline: true },
  { key: "hotline", label: "Hotline", multiline: false },
  { key: "zalo", label: "Zalo liên hệ", multiline: false },
  { key: "fanpage", label: "Fanpage", multiline: false },
  { key: "website", label: "Website", multiline: false },
  { key: "deliveryArea", label: "Khu vực giao hàng", multiline: true },
  { key: "payment", label: "Phương thức thanh toán", multiline: true },
] as const;
export type ProfileFieldKey = (typeof PROFILE_FIELDS)[number]["key"];
