/**
 * Báo giá sản xuất: kiểu dữ liệu dùng chung. Thuần (không chạm CSDL).
 * Đơn vị: mm, mm2, giây, phút, đồng (VND). Giá lưu bằng số thường vì đồng không có phần lẻ đáng kể.
 *
 * Quy tắc: THIẾU THÔNG SỐ THÌ KHÔNG RA GIÁ. Mọi hàm tính trả về danh sách thông số còn thiếu thay vì đoán.
 */

export const ENGRAVE_LEVELS = ["KHONG_KHAC", "IT", "VUA", "NHIEU"] as const;
export type EngraveLevel = (typeof ENGRAVE_LEVELS)[number];
export const ENGRAVE_LEVEL_LABEL: Record<EngraveLevel, string> = {
  KHONG_KHAC: "Không khắc (chỉ cắt)",
  IT: "Khắc ít",
  VUA: "Khắc vừa",
  NHIEU: "Khắc nhiều",
};
export const isEngraveLevel = (v: unknown): v is EngraveLevel => typeof v === "string" && (ENGRAVE_LEVELS as readonly string[]).includes(v);

export const LAST_SHEET_POLICIES = ["WHOLE_SHEET", "PRO_RATA"] as const;
export type LastSheetPolicy = (typeof LAST_SHEET_POLICIES)[number];
export const LAST_SHEET_LABEL: Record<LastSheetPolicy, string> = {
  WHOLE_SHEET: "Tính cả tấm cuối",
  PRO_RATA: "Tính theo phần dùng của tấm cuối",
};

/** Lãi cộng thêm trên giá vốn (markup) theo bậc số lượng. */
export type MarginTier = { fromQty: number; toQty: number | null; markupPct: number };

export type QuoteConfig = {
  /** khoảng cách mặc định giữa logo khi chất liệu không có riêng */
  defaultGapMm: number | null;
  lastSheetPolicy: LastSheetPolicy | null;
  marginTiers: MarginTier[];
  /** các mốc số lượng hiển thị */
  quantities: number[];
  /** làm tròn đơn giá tới bội số này (đồng) */
  roundTo: number | null;
  /** % diện tích logo được khắc theo từng mức */
  engravePct: Partial<Record<Exclude<EngraveLevel, "KHONG_KHAC">, number | null>>;
};

/** Thông số tấm của một chất liệu (tất cả có thể trống). */
export type MaterialStock = {
  stockWidthMm: number | null;
  stockHeightMm: number | null;
  stockPrice: number | null;
  edgeMarginMm: number | null;
  gapMm: number | null;
  allowRotate: boolean;
  /** công nghệ của chất liệu (khóa tìm thông số máy) */
  technique: string | null;
};

export type MachineParams = {
  cutSpeedMmPerSec: number | null;
  engraveSpeedMm2PerSec: number | null;
  setupMinutesPerJob: number | null;
  sheetChangeMinutes: number | null;
  machineCostPerHour: number | null;
  laborSecondsPerPiece: number | null;
  laborCostPerHour: number | null;
  /** vật tư theo diện tích logo (mực UV...), tùy chọn: trống = không tính */
  consumableCostPerM2: number | null;
};

/** Số đo của logo ở kích thước sale nhập. */
export type LogoMeasure = {
  widthMm: number;
  heightMm: number;
  /** tổng chu vi cần cắt (viền ngoài, lỗ trong, các mảnh rời) */
  perimeterMm: number;
  /** diện tích nội dung logo */
  areaMm2: number;
};

export type MissingScope = "material" | "machine" | "config" | "logo";
export type MissingParam = {
  code: string;
  label: string;
  scope: MissingScope;
  /** nơi admin điền */
  hint: string;
};

/** Thành phần giá vốn của một mốc số lượng. CHỈ ADMIN. */
export type CostBreakdown = {
  materialCost: number;
  machineCost: number;
  laborCost: number;
  consumableCost: number;
  /** tổng giá vốn của cả lô */
  totalCost: number;
  unitCost: number;
  markupPct: number;
  /** đơn giá trước khi làm tròn */
  unitPriceRaw: number;
};

export type QuoteLine = {
  quantity: number;
  sheetsNeeded: number;
  machineMinutes: number;
  unitPrice: number;
  totalPrice: number;
};

export type QuoteLineFull = QuoteLine & { cost: CostBreakdown };
