/**
 * Từ khoá phân loại comment (mục 6.2 của tài liệu thiết kế). Giai đoạn 1 để trong file này; trang quản trị sửa từ khoá
 * làm ở giai đoạn 2 (cùng trang Mẫu câu). Mọi cụm viết KHÔNG DẤU, chữ thường: hệ thống bỏ dấu comment rồi so khớp nguyên từ.
 */
export type CommentKeywords = {
  /** Muốn được tư vấn / báo giá: tạo dòng trong hàng chờ trả lời (giai đoạn 2). */
  interest: string[];
  /** Câu hỏi: cần người đọc kỹ. */
  question: string[];
  /** Quảng cáo của bên khác. */
  spam: string[];
};

export const DEFAULT_KEYWORDS: CommentKeywords = {
  interest: ["ib", "inbox", "check ib", "quan tam", "can tu van", "tu van", "bao gia", "xin gia", "cham", "xin bao gia"],
  question: ["bao nhieu", "bn", "o dau", "bao lau", "the nao", "nhu nao", "khong a", "duoc khong", "dc khong"],
  spam: ["tuyen ctv", "tuyen cong tac vien", "kiem tien online", "vay tien", "cho vay", "ca do", "nhan in gia re", "chiet khau cao cho dai ly"],
};
