/**
 * Các trục phân loại chất liệu và danh mục giá trị mặc định. File này không import gì nên dùng được ở cả trình duyệt lẫn máy chủ.
 * Giá trị thật do admin quản lý ở bảng material_options (Quản trị > Danh mục chất liệu); danh sách mặc định này chỉ để nạp lần đầu
 * (migration 20261119140000_material_options) và để làm dữ liệu cho test.
 */
export const OPTION_TYPES = [
  "BASE_MATERIAL",
  "TECHNIQUE",
  "SURFACE_FINISH",
  "SURFACE_PATTERN",
  "COLOR_FAMILY",
  "STYLE_TAG",
  "SERIES",
] as const;
export type OptionType = (typeof OPTION_TYPES)[number];

export const OPTION_TYPE_INFO: Record<OptionType, { title: string; hint: string }> = {
  BASE_MATERIAL: { title: "Nhóm chất liệu", hint: "Chất liệu nền: nhựa, vải, giả gương. Ghi song song vào cột nhóm cũ." },
  TECHNIQUE: { title: "Công nghệ in", hint: "Cách gia công, quyết định ảnh thành phẩm AI vẽ: Khắc laser (hai lớp, vẻ khắc), Cắt laser (decal một lớp phẳng, không viền, không khắc), In UV (in phẳng). Ghi song song vào cột công nghệ in cũ (gửi cho AI)." },
  SURFACE_FINISH: { title: "Chất bề mặt", hint: "Bề mặt trông thế nào: mờ, bóng, gương, nhũ, nhung..." },
  SURFACE_PATTERN: { title: "Họa tiết", hint: "Hình vẽ/vân trên bề mặt: trơn, caro, hoa văn, chuyển màu..." },
  COLOR_FAMILY: { title: "Họ màu", hint: "Nhóm màu dùng để lọc, cho cả mặt trước và mặt sau." },
  STYLE_TAG: { title: "Phong cách", hint: "Hợp kiểu logo nào (chọn nhiều)." },
  SERIES: { title: "Dòng nhà cung cấp", hint: "Mã dòng/tiền tố của nhà cung cấp: ZY, HT, H..." },
};

export type DefaultOption = { value: string; label: string };

export const DEFAULT_OPTIONS: Record<OptionType, DefaultOption[]> = {
  BASE_MATERIAL: [
    { value: "nhua", label: "Nhựa" },
    { value: "vai", label: "Vải" },
    { value: "gia-guong", label: "Giả gương" },
  ],
  TECHNIQUE: [
    { value: "khac-laser", label: "Khắc laser" },
    { value: "cat-laser", label: "Cắt laser" },
    { value: "in-uv", label: "In UV" },
  ],
  SURFACE_FINISH: [
    { value: "mo", label: "Mờ" },
    { value: "bong", label: "Bóng" },
    { value: "guong", label: "Gương" },
    { value: "anh-kim-xuoc", label: "Ánh kim / xước" },
    { value: "nhu-lap-lanh", label: "Nhũ / lấp lánh" },
    { value: "anh-cau-vong", label: "Ánh cầu vồng" },
    { value: "nhung-long", label: "Nhung / lông" },
    { value: "phong-noi", label: "Phồng / nổi" },
    { value: "gia-da", label: "Giả da / hạt nhám" },
    { value: "vai-det", label: "Vải dệt / jeans" },
    { value: "khac", label: "Khác" },
  ],
  SURFACE_PATTERN: [
    { value: "tron", label: "Trơn" },
    { value: "caro", label: "Caro / ô vuông" },
    { value: "ke-soc", label: "Kẻ sọc" },
    { value: "hinh-hoc", label: "Hoa văn hình học (carbon, tổ ong, đan chéo)" },
    { value: "song-xoay-ran-ri", label: "Hoa văn lượn (sóng, xoáy, rằn ri)" },
    { value: "nut-ran", label: "Nứt / rạn" },
    { value: "van-nhien", label: "Vân tự nhiên (đá, mây, loang)" },
    { value: "chuyen-mau", label: "Chuyển màu" },
    { value: "khac", label: "Khác" },
  ],
  COLOR_FAMILY: [
    { value: "trang", label: "Trắng" },
    { value: "kem-be", label: "Kem / be" },
    { value: "den", label: "Đen" },
    { value: "xam", label: "Xám" },
    { value: "bac", label: "Bạc" },
    { value: "vang-kim", label: "Vàng kim" },
    { value: "vang", label: "Vàng" },
    { value: "cam", label: "Cam" },
    { value: "do", label: "Đỏ" },
    { value: "hong", label: "Hồng" },
    { value: "tim", label: "Tím" },
    { value: "xanh-duong", label: "Xanh dương" },
    { value: "xanh-ngoc", label: "Xanh ngọc" },
    { value: "xanh-la", label: "Xanh lá" },
    { value: "nau", label: "Nâu" },
    { value: "nhieu-mau", label: "Nhiều màu" },
  ],
  STYLE_TAG: [
    { value: "toi-gian", label: "Tối giản" },
    { value: "sang-trong", label: "Sang trọng" },
    { value: "tre-trung", label: "Trẻ trung" },
    { value: "the-thao", label: "Thể thao" },
    { value: "streetwear", label: "Streetwear" },
    { value: "moc-mac", label: "Mộc mạc" },
    { value: "dong-phuc", label: "Đồng phục công ty" },
  ],
  SERIES: [
    { value: "zy", label: "ZY" },
    { value: "ht", label: "HT" },
    { value: "h", label: "H" },
    { value: "yyb", label: "YYB" },
    { value: "yps", label: "YPS" },
    { value: "lw", label: "LW" },
    { value: "11074", label: "11074" },
    { value: "11078", label: "11078" },
    { value: "su", label: "SU" },
    { value: "hb", label: "HB" },
  ],
};

/** Độ tin cậy của lần phân loại (và của từng màu). */
export const CONFIDENCE_LEVELS = [
  { value: "CAO", label: "Cao" },
  { value: "TRUNG_BINH", label: "Trung bình" },
  { value: "THAP", label: "Thấp" },
] as const;

/** Vấn đề của ảnh mẫu. CO_THUOC chỉ để ghi nhận (hầu hết ảnh đều có thước); bốn mã sau là lỗi nặng. */
export const PHOTO_ISSUES = [
  { value: "CO_THUOC", label: "Có thước trong ảnh", severe: false },
  { value: "NEN_LAN", label: "Nền lẫn (thảm, vải...)", severe: false },
  { value: "CO_TAY", label: "Có tay che mẫu", severe: true },
  { value: "MAU_LECH", label: "Màu bị lệch", severe: true },
  { value: "MO", label: "Ảnh mờ", severe: true },
  { value: "KHONG_THAY_CHAT_LIEU", label: "Không thấy rõ chất liệu", severe: true },
] as const;

export const COLOR_COUNTS = [
  { value: "ONE", label: "1 màu" },
  { value: "TWO", label: "2 màu" },
] as const;

/** Bỏ dấu, chữ thường, chỉ giữ a-z 0-9 để so khớp "Ánh Kim" với "anh kim". */
export function foldKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Tạo "value" không dấu từ nhãn tiếng Việt: "Ánh kim / xước" -> "anh-kim-xuoc". */
export function slugifyValue(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type OptionRow = { type: OptionType; value: string; label: string; sortOrder: number; isActive: boolean };

/**
 * Tìm giá trị trong danh mục theo "value" hoặc nhãn (không phân biệt hoa thường, dấu, khoảng trắng).
 * Chỉ nhận giá trị đang bật, trừ khi trùng `keep` (giá trị hiện có của chất liệu đang sửa).
 * Trả về value, hoặc null nếu không có.
 */
export function resolveOption(options: OptionRow[], type: OptionType, input: string, keep?: string | null): string | null {
  const k = foldKey(input);
  if (!k) return null;
  const found = options.find((o) => o.type === type && (foldKey(o.value) === k || foldKey(o.label) === k));
  if (!found) return null;
  if (!found.isActive && found.value !== keep) return null;
  return found.value;
}

export function optionLabel(options: OptionRow[], type: OptionType, value: string | null | undefined): string {
  if (!value) return "";
  return options.find((o) => o.type === type && o.value === value)?.label ?? value;
}
