import type { LabelPos, LabelStyle } from "@/lib/imaging/label-pos";
import type { ErrorHint } from "./error-hint";

/** Dạng dữ liệu ảnh gửi xuống trình duyệt (không có thông tin nhạy cảm). Dùng chung cho server và client. */
export type ImageStatusValue = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";

/** Các ô của một ảnh catalog, để chọn chất liệu bằng cách bấm vào số trên ảnh. */
export type PickInfo = {
  cols: number;
  rows: number;
  aspectRatio: string;
  cells: { number: number; materialId: string; code: string; name: string }[];
};

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
  /** diễn giải lỗi dễ hiểu cho mọi người xem (null khi ảnh chưa FAILED) */
  errorHint: ErrorHint | null;
  attempt: number;
  /** thời gian đã trôi qua kể từ lúc ảnh được tạo (ms), tính lúc server trả lời; dùng cho thanh tiến trình */
  ageMs: number;
  /** thời gian chờ điển hình (ms) theo độ phân giải, để chỉnh tốc độ thanh tiến trình */
  expectedMs: number;
  materialId: string | null;
  canRetry: boolean;
  /** vị trí nhãn người dùng đã chọn cho ảnh này (null = dùng mặc định trong Cấu hình) */
  labelPos: LabelPos | null;
  /** kiểu nhãn người dùng đã chọn cho ảnh này (null = dùng kiểu trong Cấu hình) */
  labelStyle: LabelStyle | null;
  /** ảnh catalog: các ô để chọn chất liệu (ảnh thiết kế không có) */
  pick: PickInfo | null;
};

export const FINAL_STATUSES: ImageStatusValue[] = ["SUCCESS", "FAILED"];

export function isFinished(status: ImageStatusValue): boolean {
  return FINAL_STATUSES.includes(status);
}
