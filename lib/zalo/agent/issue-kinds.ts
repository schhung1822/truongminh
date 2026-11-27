/**
 * Các loại sự cố của trợ lý Zalo được ghi vào bảng zalo_assistant_issues (docs/DECISIONS.md D130). File thuần, dùng chung
 * cho nơi ghi (issues.ts) và trang Cài đặt Zalo.
 *
 * `visible`: người ra lệnh có nhận câu báo lỗi không. Loại không hiện ra (visible = false) là lần AI trả lời lệch nhưng
 * trợ lý nhắc lại và làm tiếp được; chúng vẫn được ghi vì nhiều lần lệch là dấu hiệu lời dặn hoặc model cần chỉnh.
 */
export const ISSUE_KINDS = {
  CRASH: {
    label: "Lỗi máy chủ khi xử lý lệnh",
    visible: true,
    advice: "Đọc lỗi gốc. Thiếu bảng hoặc cột nghĩa là máy chủ chưa cập nhật CSDL: chạy lại bash deploy/update-pm2.sh.",
  },
  AI_UNREACHABLE: {
    label: "Không gọi được AI",
    visible: true,
    advice: "Kiểm tra token kie.ai còn không và tên model chat ở Trợ lý AI (bấm Thử AI). Lỗi mạng lẻ tẻ thì bỏ qua.",
  },
  NOT_UNDERSTOOD: {
    label: "AI trả lời sai quy ước, bot báo chưa hiểu",
    visible: true,
    advice: "Xem câu lệnh và câu AI trả lời: nếu cùng một kiểu câu lệnh hay bị, cần chỉnh lời dặn của trợ lý hoặc đổi model chat.",
  },
  DODGE_FALLBACK: {
    label: "AI không chịu chạy lệnh, bot xin nói lại",
    visible: true,
    advice: "AI tự bảo chưa tra được hoặc hứa kiểm tra rồi dừng, kể cả sau khi được nhắc. Lặp lại nhiều thì đổi model chat.",
  },
  TOO_LONG: {
    label: "Quá số bước cho một tin",
    visible: true,
    advice: "Một tin đòi nhiều việc quá, hoặc AI gọi lặp một lệnh. Nhắn tách từng việc; nếu câu ngắn vẫn bị thì báo người phát triển.",
  },
  TOOL_CRASH: {
    label: "Một lệnh chạy bị lỗi máy chủ",
    visible: true,
    advice: "Đọc tên lệnh và lỗi gốc; thường do dữ liệu của khách hoặc logo đó. Lặp lại thì báo người phát triển kèm dòng này.",
  },
  TASK_FAILED: {
    label: "Việc tạo ảnh không ra ảnh hoặc không gửi được",
    visible: true,
    advice: "Lý do tạo ảnh hỏng xem thêm ở Quản trị > Thống kê, mục Phân tích lỗi tạo ảnh. Gửi không được thì kiểm tra bot còn trong nhóm không.",
  },
  SEND_FAILED: {
    label: "Bot không gửi được tin vào Zalo",
    visible: true,
    advice: "Người ra lệnh không nhận được câu trả lời. Kiểm tra kết nối bot ở Kết nối > Zalo và bot còn trong cuộc chat đó không.",
  },
  BAD_FORMAT: {
    label: "AI trả lời sai quy ước (đã nhắc lại)",
    visible: false,
    advice: "Bot đã nhắc AI viết lại. Thỉnh thoảng thì bình thường; nhiều thì tốn thêm token và chậm hơn, nên xem lại model chat.",
  },
  DODGE: {
    label: "AI định né lệnh (đã nhắc lại)",
    visible: false,
    advice: "Bot đã nhắc AI chạy lệnh. Thỉnh thoảng thì bình thường; nhiều thì nên xem lại model chat.",
  },
  BAD_ARGS: {
    label: "AI đưa tham số sai cho lệnh",
    visible: false,
    advice: "Bot đã báo lại để AI sửa. Nếu một lệnh hay bị sai cùng một tham số thì mô tả lệnh đó cần viết rõ hơn.",
  },
} as const satisfies Record<string, { label: string; visible: boolean; advice: string }>;

export type IssueKind = keyof typeof ISSUE_KINDS;

/** Nhãn của một loại sự cố; loại lạ (dòng cũ của bản sau này) thì hiện nguyên mã. */
export function issueKindInfo(kind: string): { label: string; visible: boolean; advice: string } {
  return (ISSUE_KINDS as Record<string, { label: string; visible: boolean; advice: string }>)[kind] ?? { label: kind, visible: true, advice: "" };
}

/** Gom số lần theo loại: loại người dùng thấy đứng trước, rồi theo số lần giảm dần. */
export function summarizeIssues(groups: { kind: string; count: number }[]): { kind: string; label: string; visible: boolean; advice: string; count: number }[] {
  return groups
    .filter((g) => g.count > 0)
    .map((g) => ({ kind: g.kind, count: g.count, ...issueKindInfo(g.kind) }))
    .sort((a, b) => Number(b.visible) - Number(a.visible) || b.count - a.count || a.label.localeCompare(b.label, "vi"));
}
