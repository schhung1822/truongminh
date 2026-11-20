import type { Polygon } from "./geometry";

/**
 * Xếp logo lên tấm để BÁO GIÁ (không phải file sản xuất). Mọi kích thước tính bằng mm.
 * Hệ tọa độ: gốc (0,0) ở góc trên-trái của tấm, x sang phải, y xuống dưới.
 */

/** Đường viền logo (các mảnh ngoài) tính bằng mm, gốc ở góc trên-trái của khung bao logo, nằm trong [0,w]x[0,h]. */
export type LogoContour = {
  outers: Polygon[];
  /** sai số tối đa (mm) do đã đơn giản hóa đa giác; phép kiểm tra va chạm cộng thêm số này để chắc chắn đủ khoảng cách */
  toleranceMm: number;
};

export type NestingInput = {
  stockWidthMm: number;
  stockHeightMm: number;
  /** lề tấm: khoảng cách tối thiểu từ mép tấm tới logo */
  edgeMarginMm: number;
  /** khoảng cách tối thiểu giữa hai logo */
  gapMm: number;
  logoWidthMm: number;
  logoHeightMm: number;
  /** cho xoay 90 độ không (vải có hướng sợi hoặc họa tiết caro thì không xoay được) */
  allowRotate: boolean;
  /** đường viền thật của logo (nếu có) để xếp so le; không có thì chỉ xếp theo khung chữ nhật */
  contour?: LogoContour;
  /** diện tích thật của logo (mm2) để tính hiệu suất; không có thì lấy rộng x cao */
  logoAreaMm2?: number;
};

export type Placement = {
  /** góc trên-trái của khung bao logo đã đặt */
  x: number;
  y: number;
  /** kích thước khung bao sau khi xoay */
  width: number;
  height: number;
  rotation: 0 | 90;
};

/** Kết quả của MỘT phương án. */
export type StrategyResult = {
  placements: Placement[];
  /** mô tả ngắn cho người dùng, ví dụ "Lưới thẳng 9 x 6" */
  label: string;
};

/**
 * Cổng để cắm thêm thuật toán (ví dụ nesting theo đường viền thật, cấp 3) mà không phải sửa chỗ khác:
 * chỉ cần một đối tượng có `id`, `complexity` (số nhỏ = đơn giản, được ưu tiên khi bằng số logo) và `run`.
 */
export interface NestingStrategy {
  id: string;
  /** bằng số logo thì chọn phương án có số này nhỏ hơn */
  complexity: number;
  run(input: NestingInput): StrategyResult | null;
}

export type NestingCandidate = {
  strategy: string;
  label: string;
  count: number;
  efficiencyPct: number;
};

export type NestingResult = {
  /** tên phương án được chọn ("" nếu không xếp được) */
  strategy: string;
  label: string;
  count: number;
  placements: Placement[];
  /** diện tích logo / diện tích tấm, tính theo % */
  efficiencyPct: number;
  /** mọi phương án đã chạy, để so sánh */
  candidates: NestingCandidate[];
  warnings: string[];
  /** có lỗi thì count = 0 và đây là lời giải thích bằng tiếng Việt */
  error?: string;
};
