"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/dal";
import { roundPrice, stockToForm, type StockFormValues } from "@/lib/materials/stock";
import { cmToMm } from "@/lib/materials/stock-input";
import { materialStockSchema } from "@/lib/quoting/schemas";
import { saveMaterialStock } from "@/lib/quoting/store";

export type StockActionResult = {
  error?: string;
  ok?: string;
  /** giá trị đã chuẩn hóa sau khi lưu, để form điền lại đúng như đã lưu */
  values?: StockFormValues;
};

const NOT_FOUND = "Không tìm thấy chất liệu.";

/**
 * Lưu thông số tấm của một chất liệu (chỉ ADMIN). Kích thước tấm nhận bằng cm, đổi sang mm trước khi kiểm tra bằng materialStockSchema.
 * Ghi qua saveMaterialStock nên lịch sử thay đổi và phiên bản thông số được cập nhật. Ô trống = chưa có dữ liệu (null), không phải 0.
 */
export async function saveMaterialStockAction(materialId: string, raw: StockFormValues): Promise<StockActionResult> {
  const user = await requireAdmin();
  if (typeof materialId !== "string" || !materialId) return { error: NOT_FOUND };
  if (!raw || typeof raw !== "object" || typeof raw.allowRotate !== "boolean") return { error: "Dữ liệu gửi lên không hợp lệ." };

  const widthMm = cmToMm(raw.widthCm);
  const heightMm = cmToMm(raw.heightCm);
  const bad: string[] = [];
  if (widthMm === "invalid") bad.push("Rộng tấm (cm): không phải số hợp lệ.");
  if (heightMm === "invalid") bad.push("Cao tấm (cm): không phải số hợp lệ.");
  if (bad.length) return { error: bad.join(" ") };

  const parsed = materialStockSchema.safeParse({
    stockWidthMm: widthMm,
    stockHeightMm: heightMm,
    stockPrice: raw.price,
    edgeMarginMm: raw.edgeMarginMm,
    gapMm: raw.gapMm,
    allowRotate: raw.allowRotate,
  });
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => {
      const field = i.path[0];
      // kích thước tấm được kiểm tra bằng mm nhưng người dùng nhập cm: nói lại giới hạn theo cm
      if ((field === "stockWidthMm" || field === "stockHeightMm") && i.message.includes("tối đa")) {
        return `${field === "stockWidthMm" ? "Rộng tấm" : "Cao tấm"} (cm): tối đa 10000.`;
      }
      return i.message;
    });
    return { error: [...new Set(messages)].join(" ") };
  }

  const input = { ...parsed.data };
  if (input.stockPrice !== null) {
    input.stockPrice = roundPrice(input.stockPrice); // cột giá trong CSDL có 2 chữ số thập phân
    if (!(input.stockPrice > 0)) return { error: "Giá một tấm: phải lớn hơn 0." };
  }

  try {
    const r = await saveMaterialStock(materialId, input, user.id);
    revalidatePath("/admin/materials");
    revalidatePath(`/admin/materials/${materialId}`);
    revalidatePath("/admin/quoting/materials");
    return {
      ok: r.changed ? "Đã lưu thông số tấm." : "Không có thay đổi nào để lưu.",
      values: stockToForm(input),
    };
  } catch (e) {
    if (e instanceof Error && e.message === NOT_FOUND) return { error: NOT_FOUND };
    console.error("saveMaterialStockAction lỗi:", e);
    return { error: "Không lưu được thông số tấm. Vui lòng thử lại." };
  }
}
