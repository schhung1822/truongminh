import type { LabelPos, LabelStyle } from "@/lib/imaging/label-pos";

/** Bản chụp bố cục lưu cùng mỗi ảnh (cột "layoutSnapshot"), để sau này sửa trang mẫu không làm sai ảnh cũ. */
export type LayoutSnapshot = {
  cols: number;
  rows: number;
  /** tên trang mẫu (ảnh catalog) hoặc tên chất liệu (ảnh thiết kế) */
  title: string;
  /** số thứ tự ảnh trong phiên (1, 2, 3...), in ở đầu ảnh dạng "Ảnh 1"; giữ nguyên khi tạo lại */
  imageNumber?: number;
  /** trang mẫu dài được chia thành nhiều ảnh: đây là ảnh thứ index trong total ảnh của trang (title đã có "(2/10)") */
  part?: { index: number; total: number };
  /** vị trí thẻ nhãn chất liệu do người dùng chọn cho ảnh này; chưa chọn thì dùng mặc định trong Cấu hình */
  labelPos?: LabelPos;
  /** kiểu nhãn do người dùng chọn cho ảnh này (thẻ đầy đủ, thẻ gọn, chú giải, ẩn); chưa chọn thì dùng kiểu trong Cấu hình */
  labelStyle?: LabelStyle;
  /** true = ảnh tạo ở chế độ chất lượng cao (D120): AI vẽ từng mảnh 4 ô rồi ghép; `cols`/`rows` là lưới SAU khi ghép */
  quality?: boolean;
  /** các ô theo thứ tự đọc; ảnh thiết kế chỉ có một ô */
  cells: {
    materialId: string;
    code: string;
    name: string;
    /** loại chất liệu (nhóm: vải, nhựa...) và công nghệ in, in trên nhãn */
    groupName?: string;
    printTech?: string;
  }[];
  design?: {
    productType: string;
    styleName: string;
    note: string;
    /** @deprecated giữ lại để đọc ảnh cũ tạo trước khi cho chọn nhiều ảnh (docs/DECISIONS.md D99); dùng getStyleRefPinIds() thay vì đọc trực tiếp */
    pinterestPinId?: string;
    /** PinterestPin.id (CSDL của ta) dùng làm ảnh phong cách tham khảo thêm cho AI, tối đa MAX_STYLE_REF_PINS; không chọn thì bỏ trống */
    pinterestPinIds?: string[];
  };
};

/**
 * Danh sách PinterestPin.id dùng làm ảnh phong cách tham khảo của một ảnh thiết kế, đọc được cả ảnh cũ (field số ít
 * `pinterestPinId` trước D99) lẫn ảnh mới (`pinterestPinIds`). Luôn dùng hàm này thay vì đọc trực tiếp field.
 */
export function getStyleRefPinIds(snap: Pick<LayoutSnapshot, "design">): string[] {
  if (snap.design?.pinterestPinIds?.length) return snap.design.pinterestPinIds;
  return snap.design?.pinterestPinId ? [snap.design.pinterestPinId] : [];
}

/** Số ảnh tối đa trong một phiên (một trang mẫu dài có thể ra nhiều ảnh). */
export const MAX_IMAGES_PER_SESSION = 20;
export const MAX_ATTEMPTS = 2; // lần đầu + 1 lần tự thử lại
