/** Nhãn hiển thị của hàng chờ trả lời. Dùng chung cho trang (server) và phần tương tác (client); không đụng CSDL. */

export const REPLY_STATUSES = ["DRAFT", "APPROVED", "FILLED", "SENT", "SKIPPED", "FAILED"] as const;
export type ReplyStatus = (typeof REPLY_STATUSES)[number];

export const REPLY_STATUS_LABEL: Record<ReplyStatus, string> = {
  DRAFT: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  FILLED: "Đã điền",
  SENT: "Đã gửi",
  SKIPPED: "Bỏ qua",
  FAILED: "Lỗi",
};

/** Giải thích ngắn cho từng trạng thái, hiện dưới tiêu đề trang. */
export const REPLY_STATUS_HINT: Record<ReplyStatus, string> = {
  DRAFT: "Câu vừa soạn. Đọc, sửa nếu cần rồi duyệt.",
  APPROVED: "Đã duyệt. Mở extension, bấm Xử lý trả lời để extension điền sẵn vào Facebook.",
  FILLED: "Extension đã điền vào ô trả lời, đang chờ người bấm gửi trên Facebook.",
  SENT: "Câu trả lời đã xuất hiện dưới comment.",
  SKIPPED: "Không trả lời comment này.",
  FAILED: "Extension không điền được. Xem lý do ở từng dòng.",
};

export const REPLY_STATUS_TONE: Record<ReplyStatus, string> = {
  DRAFT: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  APPROVED: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  FILLED: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  SENT: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  SKIPPED: "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  FAILED: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
};

export const INTENT_LABEL = { SUPPLIER_OFFER: "Mời nhà sản xuất", ANSWER_INTEREST: "Dẫn khách về inbox" } as const;
export const REPLY_AS_LABEL = { ACCOUNT: "Nick", PAGE: "Fanpage" } as const;

export const SUPPLIER_TYPE_LABEL = { MANUFACTURER: "Xưởng trực tiếp", BROKER: "Môi giới", UNKNOWN: "Chưa rõ" } as const;
export type SupplierTypeValue = keyof typeof SUPPLIER_TYPE_LABEL;

/** Lý do bỏ qua / lỗi: mã do webapp hoặc extension ghi vào cột failReason. Mã lạ thì hiện nguyên văn. */
const FAIL_REASON_LABEL: Record<string, string> = {
  page_not_available: "Không trả lời được dưới tên fanpage ở bài này (nhóm không cho, hoặc nick không quản lý fanpage)",
  identity_unverified: "Đã chọn fanpage nhưng không xác nhận được danh tính đang dùng, nên không điền",
  comment_not_found: "Không tìm thấy comment trên bài (đã bị xóa, bị ẩn, hoặc Facebook chưa hiển thị)",
  reply_button_not_found: "Không thấy nút Phản hồi của comment",
  reply_box_not_found: "Không thấy ô nhập câu trả lời",
  fill_failed: "Không điền được chữ vào ô trả lời",
  tab_closed: "Tab Facebook bị đóng giữa chừng",
  page_load_timeout: "Trang Facebook tải quá lâu",
  login_required: "Facebook hiện trang đăng nhập",
  checkpoint: "Facebook yêu cầu xác minh nick",
  content_unreachable: "Không nạp được bộ đọc trang vào tab Facebook",
  not_sent_in_time: "Đã điền nhưng không thấy câu trả lời được gửi trong thời gian chờ",
  skipped_in_extension: "Bỏ qua trên extension",
  skipped_on_web: "Bỏ qua trên webapp",
  already_replied: "Comment đã có trả lời của nick hoặc fanpage",
  ai_should_not_reply: "AI đánh giá không nên trả lời comment này",
  page_deleted: "Fanpage đã bị gỡ khỏi danh sách",
};

export function failReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "";
  return FAIL_REASON_LABEL[reason] ?? reason;
}
