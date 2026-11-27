/**
 * Diễn giải lỗi ảnh bằng tiếng Việt dễ hiểu cho sale, dựa theo các câu lỗi gốc hệ thống đã ghi (xem lib/providers/kie.ts,
 * lib/jobs/references.ts, lib/jobs/process.ts). Khác với `errorDetail` (chuỗi lỗi gốc, chỉ admin thấy), hint này hiện
 * cho mọi người xem ảnh lỗi, để sale biết có nên bấm "Tạo lại" ngay hay cần chờ/báo quản trị viên trước.
 */

export type ErrorHintKind = "retry" | "admin" | "unknown";
export type ErrorHint = { kind: ErrorHintKind; message: string };

const DEFAULT_HINT: ErrorHint = {
  kind: "unknown",
  message: "Có lỗi khi tạo ảnh này. Bạn có thể bấm \"Tạo lại\" để thử lần nữa; nếu lỗi lặp lại nhiều lần, báo quản trị viên.",
};

export function hintForError(raw: string | null): ErrorHint {
  if (!raw) return DEFAULT_HINT;
  const text = raw.toLowerCase();

  if (text.includes("hết credits") || text.includes("không hợp lệ hoặc đã bị thu hồi")) {
    return {
      kind: "admin",
      message: "Hệ thống tạo ảnh AI tạm thời không dùng được (hết tiền dịch vụ hoặc khóa kết nối có vấn đề). Cần quản trị viên kiểm tra trước — bấm \"Tạo lại\" ngay bây giờ sẽ chưa được.",
    };
  }
  if (text.includes("chưa có ảnh tham chiếu")) {
    return {
      kind: "admin",
      message: "Một chất liệu trong trang mẫu này chưa có đủ ảnh để AI tham khảo. Báo quản trị viên kiểm tra Thư viện mẫu; \"Tạo lại\" sẽ vẫn lỗi tới khi đó.",
    };
  }
  if (text.includes("không còn trong kho ảnh")) {
    return {
      kind: "admin",
      message: "Ảnh của một số chất liệu trong ảnh này không còn trong kho ảnh của hệ thống. Báo quản trị viên đồng bộ lại dữ liệu chất liệu; \"Tạo lại\" sẽ vẫn lỗi tới khi đó.",
    };
  }
  if (text.includes("ảnh phong cách pinterest")) {
    return {
      kind: "admin",
      message: "Ảnh Pinterest đã chọn không còn trong thư viện. Hãy tạo lại lượt thiết kế và chọn một ảnh phong cách khác.",
    };
  }
  if (text.includes("giới hạn tốc độ") || text.includes("chờ quá lâu") || text.includes("rate limit")) {
    return {
      kind: "retry",
      message: "Hệ thống đang bận vì có nhiều người cùng tạo ảnh. Đợi một chút rồi bấm \"Tạo lại\" là được.",
    };
  }
  return DEFAULT_HINT;
}
