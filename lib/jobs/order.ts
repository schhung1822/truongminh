/** Thứ tự ổn định của các ảnh trong một phiên: theo thứ tự trang mẫu, rồi chất liệu, rồi lượt, rồi thời gian tạo. */
export type Orderable = {
  materialId: string | null;
  variantIndex: number;
  createdAt: Date;
  sheet: { sortOrder: number } | null;
};

export function compareSessionImages(a: Orderable, b: Orderable): number {
  return (
    (a.sheet?.sortOrder ?? 0) - (b.sheet?.sortOrder ?? 0) ||
    (a.materialId ?? "").localeCompare(b.materialId ?? "") ||
    a.variantIndex - b.variantIndex ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}
