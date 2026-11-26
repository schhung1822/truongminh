"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/dal";
import { retryAutoCatalogSession, runAutoCatalogAnalysis, startAutoCatalogSession } from "@/lib/jobs/auto";
import { createAllMaterialsSession, createCatalogSession, retryImage } from "@/lib/jobs/create";
import { createDesignSession } from "@/lib/jobs/design";
import { retryPinDesignSession, runPinDesignAnalysis, startPinDesignSession } from "@/lib/jobs/pin-design";
import { kickSession } from "@/lib/jobs/process";
import { isLabelPos, isLabelStyle, type LabelPos, type LabelStyle } from "@/lib/imaging/label-pos";
import { refinishSession } from "@/lib/jobs/refinish";
import { db } from "@/lib/db";
import { canEditOwned } from "@/lib/permissions";

/**
 * Lỗi BẤT NGỜ khi tạo phiên (CSDL, lỗi lập trình...): ghi log đầy đủ ở máy chủ và trả về một câu báo rõ là lỗi máy chủ.
 * Nếu để lỗi ném ra, trình duyệt chỉ biết "không gửi được yêu cầu" và người dùng tưởng là mất mạng hay do kie.ai.
 * Các lỗi nghiệp vụ (hết lượt, thiếu trang mẫu...) vẫn do từng hàm trả về trong `error` như cũ.
 */
async function guarded(what: string, run: () => Promise<{ error?: string; sessionId?: string }>): Promise<{ error?: string; sessionId?: string }> {
  try {
    return await run();
  } catch (e) {
    console.error(`${what} lỗi bất ngờ:`, e);
    return { error: `Máy chủ gặp lỗi khi ${what} (không phải do mạng hay kie.ai). Hãy bấm lại; nếu vẫn lỗi, báo quản trị viên kèm giờ bạn bấm để tra log.` };
  }
}

/** `quality`: ô "Chất lượng cao" (D120) người dùng chọn; bỏ trống = theo mặc định ở Quản trị > Cấu hình. */
export async function createCatalogSessionAction(
  logoId: string,
  sheetIds: string[],
  quality?: boolean,
): Promise<{ error?: string; sessionId?: string }> {
  const user = await requireUser();
  const r = await guarded("tạo phiên ảnh mẫu", () => createCatalogSession(user, { logoId, sheetIds, quality: typeof quality === "boolean" ? quality : undefined }));
  if (r.sessionId) {
    const id = r.sessionId;
    after(() => kickSession(id)); // gửi sang nhà cung cấp SAU khi đã trả lời trình duyệt
  }
  return r;
}

/** Tạo ảnh mẫu với TẤT CẢ chất liệu đang bật (nút "Tất cả chất liệu", D126). */
export async function createAllMaterialsSessionAction(logoId: string, quality?: boolean): Promise<{ error?: string; sessionId?: string }> {
  const user = await requireUser();
  const r = await guarded("tạo ảnh với tất cả chất liệu", () => createAllMaterialsSession(user, { logoId: String(logoId ?? "").slice(0, 191), quality: typeof quality === "boolean" ? quality : undefined }));
  if (r.sessionId) {
    const id = r.sessionId;
    after(() => kickSession(id)); // gửi sang nhà cung cấp SAU khi đã trả lời trình duyệt
  }
  return r;
}

/**
 * AI xem logo, chọn các chất liệu hợp nhất rồi tạo ảnh mẫu (D115). AI cũng quyết định luôn logo có phải dạng huy hiệu / bảng
 * không, trừ khi logo đã được đánh dấu là huy hiệu (D126: công tắc tay ở khung logo đã bỏ). Trả về NGAY mã phiên; việc AI phân tích (30-60 giây) và tạo ảnh chạy
 * nền qua after(), trang phiên tự hiện "AI đang phân tích" rồi hiện ảnh (D119). Nhờ vậy request không bao giờ bị proxy cắt.
 */
export async function autoCatalogSessionAction(logoId: string, quality?: boolean): Promise<{ error?: string; sessionId?: string }> {
  const user = await requireUser();
  const r = await guarded("bắt đầu AI chọn chất liệu", () => startAutoCatalogSession(user, { logoId, decideBadge: true, quality: typeof quality === "boolean" ? quality : undefined }));
  if (r.sessionId) {
    const id = r.sessionId;
    after(() => runAutoCatalogAnalysis(id));
  }
  return r;
}

/** Thử lại việc AI chọn chất liệu cho một phiên đã phân tích hỏng (chưa có ảnh nào). */
export async function retryAutoAnalysisAction(sessionId: string): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  // phiên thiết kế theo mẫu Pinterest (D125) cũng dùng nút Thử lại này, nhưng việc nền của nó khác
  const row = await db.consultSession.findUnique({ where: { id: sessionId }, select: { type: true } });
  const pinDesign = row?.type === "DESIGN";
  const r = pinDesign ? await retryPinDesignSession(user, sessionId) : await retryAutoCatalogSession(user, sessionId);
  if (r.error) return { error: r.error };
  after(() => (pinDesign ? runPinDesignAnalysis(sessionId) : runAutoCatalogAnalysis(sessionId)));
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true };
}

/**
 * Thiết kế theo mẫu Pinterest (D125): sale chọn 1-3 pin cho một logo, AI tự chọn `materialCount` chất liệu hợp logo và mẫu,
 * rồi tạo ảnh thiết kế dùng các pin làm ảnh phong cách. Trả về NGAY mã phiên; AI phân tích và tạo ảnh chạy nền qua after().
 */
export async function createPinDesignSessionAction(input: {
  logoId: string;
  pinIds: string[];
  productType: string;
  materialCount: number;
  variants: number;
  note: string;
}): Promise<{ error?: string; sessionId?: string }> {
  const user = await requireUser();
  const clean = {
    logoId: String(input?.logoId ?? "").slice(0, 191),
    pinIds: Array.isArray(input?.pinIds) ? input.pinIds.filter((x): x is string => typeof x === "string").slice(0, 20) : [],
    productType: String(input?.productType ?? ""),
    materialCount: Number(input?.materialCount),
    variants: Number(input?.variants),
    note: String(input?.note ?? ""),
  };
  const r = await guarded("bắt đầu thiết kế theo mẫu Pinterest", () => startPinDesignSession(user, clean));
  if (r.sessionId) {
    const id = r.sessionId;
    after(() => runPinDesignAnalysis(id));
  }
  return r;
}

/** Bước 2: tạo các ảnh thiết kế cho những chất liệu khách đã chọn. */
export async function createDesignSessionAction(input: {
  parentSessionId: string;
  materialIds: string[];
  productType: string;
  variants: number;
  note: string;
  /** PinterestPin.id dùng làm ảnh phong cách tham khảo thêm cho AI, tối đa MAX_STYLE_REF_PINS; không bắt buộc */
  styleRefPinIds?: string[];
}): Promise<{ error?: string; sessionId?: string }> {
  const user = await requireUser();
  const r = await createDesignSession(user, input);
  if (r.sessionId) {
    const id = r.sessionId;
    after(() => kickSession(id));
  }
  return r;
}

/** Vẽ lại khung, nhãn và chân trang của các ảnh đã xong theo giao diện/cấu hình mới. Không gọi AI, không tốn token. */
export async function refinishSessionAction(sessionId: string): Promise<{ error?: string; count?: number }> {
  const user = await requireUser();
  const session = await db.consultSession.findUnique({ where: { id: sessionId }, select: { createdById: true } });
  if (!session) return { error: "Không tìm thấy phiên." };
  if (!canEditOwned(user, session.createdById)) return { error: "Bạn chỉ vẽ lại được ảnh của phiên do mình tạo." };
  const count = await refinishSession(sessionId);
  revalidatePath(`/sessions/${sessionId}`);
  return { count };
}

/**
 * Đổi kiểu và vị trí nhãn chất liệu của một ảnh (hoặc mọi ảnh của phiên) rồi vẽ lại ảnh. Không gọi AI nên không tốn token.
 * Vị trí được lưu cùng ảnh, nên lần vẽ lại và tạo lại sau này vẫn giữ.
 */
export async function setLabelPositionAction(input: {
  sessionId: string;
  imageId?: string;
  labelPos?: string;
  labelStyle?: string;
}): Promise<{ error?: string; count?: number }> {
  const user = await requireUser();
  if (input.labelPos !== undefined && !isLabelPos(input.labelPos)) return { error: "Vị trí nhãn không hợp lệ." };
  if (input.labelStyle !== undefined && !isLabelStyle(input.labelStyle)) return { error: "Kiểu nhãn không hợp lệ." };
  if (!input.labelPos && !input.labelStyle) return { error: "Chưa chọn kiểu hoặc vị trí nhãn." };
  const session = await db.consultSession.findUnique({
    where: { id: input.sessionId },
    select: { createdById: true, images: { where: { retries: { none: {} } }, select: { id: true } } },
  });
  if (!session) return { error: "Không tìm thấy phiên." };
  if (!canEditOwned(user, session.createdById)) return { error: "Bạn chỉ chỉnh được nhãn của phiên do mình tạo." };
  if (input.imageId && !session.images.some((i) => i.id === input.imageId)) return { error: "Ảnh không thuộc phiên này." };
  const count = await refinishSession(input.sessionId, {
    imageId: input.imageId,
    labelPos: input.labelPos as LabelPos | undefined,
    labelStyle: input.labelStyle as LabelStyle | undefined,
  });
  revalidatePath(`/sessions/${input.sessionId}`);
  return { count };
}

export async function retryImageAction(imageId: string): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const r = await retryImage(user, imageId);
  if (r.error) return { error: r.error };
  const id = r.sessionId!;
  after(() => kickSession(id));
  revalidatePath(`/sessions/${id}`);
  return { ok: true };
}
