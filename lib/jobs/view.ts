/** Dạng dữ liệu ảnh gửi xuống trình duyệt (không có thông tin nhạy cảm). Dùng chung cho server và client. */
export type ImageStatusValue = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";

export type ImageView = {
  id: string;
  kind: "SHEET" | "DESIGN";
  status: ImageStatusValue;
  /** nhãn hiển thị: tên trang mẫu, hoặc "chất liệu - kiểu thiết kế" */
  label: string;
  /** ảnh hoàn thiện (có đầu trang, nhãn, chân trang) */
  finalUrl: string | null;
  downloadUrl: string | null;
  /** thông báo lỗi chi tiết, chỉ gửi cho admin */
  errorDetail: string | null;
  attempt: number;
  materialId: string | null;
  canRetry: boolean;
};

export const FINAL_STATUSES: ImageStatusValue[] = ["SUCCESS", "FAILED"];

export function isFinished(status: ImageStatusValue): boolean {
  return FINAL_STATUSES.includes(status);
}
