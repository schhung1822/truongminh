import "server-only";
import type { SessionUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { assignStyles, PIN_DESIGN_DEFAULT_MATERIALS, PIN_DESIGN_DEFAULT_VARIANTS, validatePinDesignRequest } from "@/lib/design/assign";
import { MAX_STYLE_REF_PINS } from "@/lib/image-options";
import { loadOptions } from "@/lib/materials/options";
import { optionLabel } from "@/lib/materials/option-types";
import { canEditOwned } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { readAiState, type SessionAiAnalysis, type SessionAiPending } from "./ai-state";
import { aiJson, askAiForMaterials, markAiFailed, USABLE_MATERIAL } from "./auto";
import type { BuiltImage } from "./built";
import { buildDesignImage } from "./design";
import { assertQuota, todayKey } from "./limits";
import { ensurePinterestPinUrl } from "./pinterest-reference";
import { kickSession } from "./process";
import { getActiveTemplate, type Template } from "./template";

/**
 * THIẾT KẾ THEO MẪU PINTEREST (docs/DECISIONS.md D125): sale chọn 1-3 pin khách thích cho một logo, AI tự chọn vài chất
 * liệu hợp với logo và các mẫu đó, rồi hệ thống tạo ảnh thiết kế (cùng loại ảnh với Bước 2) dùng các pin làm ảnh phong cách
 * tham khảo. Khác Bước 2 ở chỗ KHÔNG cần phiên catalog trước: phiên tạo ra là phiên DESIGN không có phiên cha.
 *
 * Chạy hai bước như "AI chọn chất liệu" (D119): startPinDesignSession kiểm tra nhanh và tạo phiên ở trạng thái
 * "AI đang phân tích" ngay trong request; runPinDesignAnalysis chạy nền (after()) để hỏi AI rồi dựng ảnh.
 */

const FAIL = "AI chưa chọn được chất liệu cho logo này. Hãy thử lại.";
const NO_PIN = "Một mẫu Pinterest đã chọn không còn trong thư viện. Hãy chọn lại mẫu.";

type Actor = Pick<SessionUser, "id" | "role">;
type Request = { pinIds: string[]; materialCount: number; variants: number; productType: string };

/** Các điều kiện kiểm tra được ngay, không cần gọi AI. Trả về số chất liệu sẽ nhờ AI chọn, hoặc lỗi. */
async function precheck(user: Actor, input: Request): Promise<{ requested: number } | { error: string }> {
  const invalid = validatePinDesignRequest({ pinCount: input.pinIds.length, materialCount: input.materialCount, variants: input.variants, productType: input.productType });
  if (invalid) return { error: invalid };
  const [pins, usable, styles] = await Promise.all([
    db.pinterestPin.count({ where: { id: { in: input.pinIds } } }),
    db.material.count({ where: USABLE_MATERIAL }),
    db.designStyle.count({ where: { isActive: true } }),
  ]);
  if (pins !== input.pinIds.length) return { error: NO_PIN };
  if (usable === 0) return { error: "Chưa có chất liệu nào đang bật và có ảnh tham chiếu." };
  if (styles === 0) return { error: "Chưa có kiểu thiết kế nào đang bật. Quản trị viên hãy thêm ở Quản trị > Kiểu thiết kế." };
  const requested = Math.min(input.materialCount, usable);
  // kiểm tra hạn mức TRƯỚC khi gọi AI: mỗi ảnh thiết kế tính một lượt
  const quotaError = await assertQuota(user, requested * input.variants);
  if (quotaError) return { error: quotaError };
  try {
    await getActiveTemplate("DESIGN");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Thiếu prompt." };
  }
  return { requested };
}

/** BƯỚC 1, trong request: kiểm tra rồi tạo phiên DESIGN (không có phiên cha) ở trạng thái "AI đang phân tích". */
export async function startPinDesignSession(
  user: SessionUser,
  input: { logoId: string; pinIds: string[]; productType: string; materialCount: number; variants: number; note: string },
): Promise<{ error?: string; sessionId?: string }> {
  const pinIds = [...new Set(input.pinIds.map((x) => x.trim().slice(0, 191)).filter(Boolean))];
  const productType = input.productType.trim().slice(0, 200);
  const note = input.note.trim().slice(0, 1000);

  const logo = await db.logo.findUnique({ where: { id: input.logoId }, select: { id: true } });
  if (!logo) return { error: "Không tìm thấy logo." };
  const pre = await precheck(user, { pinIds, materialCount: input.materialCount, variants: input.variants, productType });
  if ("error" in pre) return pre;

  const pending: SessionAiPending = { status: "ANALYZING", startedAt: new Date().toISOString(), requested: pre.requested, decideBadge: false, pinIds };
  const session = await db.consultSession.create({
    data: { type: "DESIGN", logoId: logo.id, productType, variantsPerMaterial: input.variants, note: note || null, createdById: user.id, aiAnalysis: aiJson(pending) },
  });
  return { sessionId: session.id };
}

/** Thử lại một phiên thiết kế theo mẫu mà AI phân tích hỏng (chưa có ảnh nào). Chỉ người tạo phiên hoặc quản trị viên. */
export async function retryPinDesignSession(user: SessionUser, sessionId: string): Promise<{ error?: string; ok?: true }> {
  const session = await db.consultSession.findUnique({
    where: { id: sessionId },
    select: { type: true, parentId: true, createdById: true, productType: true, variantsPerMaterial: true, aiAnalysis: true, _count: { select: { images: true } } },
  });
  if (!session || session.type !== "DESIGN" || session.parentId) return { error: "Không tìm thấy phiên." };
  if (!canEditOwned(user, session.createdById)) return { error: "Bạn chỉ thử lại được phiên do mình tạo." };
  const state = readAiState(session.aiAnalysis);
  if (state.kind === "analyzing") return { error: "AI đang phân tích logo này, vui lòng chờ." };
  if (state.kind !== "failed" || session._count.images > 0) return { error: "Phiên này không cần thử lại." };
  if (state.pinIds.length === 0) return { error: "Phiên này không còn thông tin mẫu Pinterest. Hãy chọn lại mẫu từ logo." };

  const pre = await precheck(user, {
    pinIds: state.pinIds,
    materialCount: state.requested || PIN_DESIGN_DEFAULT_MATERIALS,
    variants: session.variantsPerMaterial ?? PIN_DESIGN_DEFAULT_VARIANTS,
    productType: session.productType ?? "",
  });
  if ("error" in pre) return pre;
  const pending: SessionAiPending = { status: "ANALYZING", startedAt: new Date().toISOString(), requested: pre.requested, decideBadge: false, pinIds: state.pinIds };
  await db.consultSession.update({ where: { id: sessionId }, data: { aiAnalysis: aiJson(pending) } });
  return { ok: true };
}

/**
 * BƯỚC 2, chạy NỀN: AI xem logo và các mẫu, chọn chất liệu; hệ thống tạo ảnh thiết kế PENDING kèm lượt dùng rồi đẩy đi tạo.
 * Hỏng ở đâu thì ghi lý do vào phiên, KHÔNG tạo ảnh và KHÔNG trừ lượt. Không bao giờ ném lỗi ra ngoài.
 */
export async function runPinDesignAnalysis(sessionId: string): Promise<void> {
  try {
    const r = await analyseAndBuild(sessionId);
    if (r.error) {
      await markAiFailed(sessionId, r.error);
      return;
    }
    if (r.created) await kickSession(sessionId);
  } catch (e) {
    console.error(`Thiết kế theo mẫu Pinterest lỗi (phiên ${sessionId}):`, e);
    await markAiFailed(sessionId, FAIL);
  }
}

async function analyseAndBuild(sessionId: string): Promise<{ error?: string; created?: boolean }> {
  const session = await db.consultSession.findUnique({
    where: { id: sessionId },
    include: { logo: true, createdBy: { select: { id: true, role: true } }, _count: { select: { images: true } } },
  });
  if (!session || session.type !== "DESIGN" || session.parentId) return {};
  const state = readAiState(session.aiAnalysis);
  if (state.kind !== "analyzing" || session._count.images > 0) return {}; // đã xong, đã hỏng hoặc đang do lượt khác xử lý
  const { logo, createdBy: user } = session;
  const pinIds = state.pinIds.slice(0, MAX_STYLE_REF_PINS);
  const productType = session.productType ?? "";
  const variants = session.variantsPerMaterial ?? PIN_DESIGN_DEFAULT_VARIANTS;
  const note = session.note ?? "";

  const [pinRows, styles, settings, options] = await Promise.all([
    db.pinterestPin.findMany({ where: { id: { in: pinIds } }, include: { board: { select: { techniqueHint: true } } } }),
    db.designStyle.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    getSettings(),
    loadOptions(),
  ]);
  if (pinIds.length === 0 || pinRows.length !== pinIds.length) return { error: NO_PIN };
  if (styles.length === 0) return { error: "Chưa có kiểu thiết kế nào đang bật. Quản trị viên hãy thêm ở Quản trị > Kiểu thiết kế." };
  let template: Template;
  try {
    template = await getActiveTemplate("DESIGN");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Thiếu prompt." };
  }

  // giữ đúng thứ tự sale đã chọn
  const pinById = new Map(pinRows.map((p) => [p.id, p]));
  const pins = pinIds.map((id) => pinById.get(id)!);
  // board của mẫu có gắn công nghệ (admin gắn ở Kết nối > Pinterest): dặn AI ưu tiên chất liệu cùng công nghệ
  const techniques = [...new Set(pins.map((p) => p.board.techniqueHint).filter((v): v is string => !!v))].map((v) => optionLabel(options, "TECHNIQUE", v) || v);

  // Ảnh mẫu phải tải được: lúc tạo ảnh cũng cần đúng các ảnh này, nên hỏng thì dừng sớm, chưa trừ lượt nào.
  let imageUrls: string[];
  try {
    imageUrls = await Promise.all(pins.map((p) => ensurePinterestPinUrl(p)));
  } catch (e) {
    console.error(`Thiết kế theo mẫu Pinterest (phiên ${sessionId}): không tải được ảnh mẫu:`, e);
    return { error: "Không tải được ảnh mẫu Pinterest đã chọn (ảnh có thể đã bị gỡ trên Pinterest). Hãy chọn mẫu khác." };
  }

  const asked = await askAiForMaterials({
    sessionId,
    logo,
    requested: state.requested || PIN_DESIGN_DEFAULT_MATERIALS,
    sample: { productType, techniques, imageUrls },
  });
  if ("error" in asked) return asked;
  const { analysis, rows, requested } = asked;

  const byId = new Map(rows.map((m) => [m.id, m]));
  const materials = analysis.picks.map((p) => byId.get(p.materialId)).filter((m): m is NonNullable<typeof m> => !!m);
  if (materials.length === 0) return { error: `${FAIL} (AI không chọn được chất liệu nào)` };

  const plan = assignStyles(materials.length, variants, styles.length);
  const built: BuiltImage[] = [];
  let number = 0;
  for (const [mi, material] of materials.entries()) {
    for (let v = 0; v < variants; v++) {
      number++;
      const r = buildDesignImage({
        material,
        style: styles[plan[mi][v]],
        variantIndex: v,
        imageNumber: number,
        productType,
        note,
        template,
        settings,
        logoIsBadge: logo.isBadge,
        styleRefPinIds: pinIds,
      });
      if ("error" in r) return { error: r.error };
      built.push(r.data);
    }
  }

  // Trong lúc AI phân tích người này có thể đã dùng hết lượt ở phiên khác: kiểm tra lại ngay trước khi tạo ảnh
  const quotaError = await assertQuota(user, built.length);
  if (quotaError) return { error: quotaError };

  const done: SessionAiAnalysis = { status: "DONE", summary: analysis.summary, isBadge: analysis.isBadge, model: asked.model, requested, picks: analysis.picks, pinIds };
  const day = todayKey();
  const created = await db.$transaction(async (tx) => {
    // chống tạo trùng nếu việc nền bị gọi hai lần cho cùng một phiên
    const fresh = await tx.consultSession.findUnique({ where: { id: sessionId }, select: { aiAnalysis: true, _count: { select: { images: true } } } });
    if (!fresh || fresh._count.images > 0 || readAiState(fresh.aiAnalysis).kind !== "analyzing") return false;
    await tx.consultSession.update({ where: { id: sessionId }, data: { aiAnalysis: aiJson(done) } });
    await tx.sessionSelectedMaterial.createMany({ data: materials.map((m) => ({ sessionId, materialId: m.id })) });
    for (const data of built) {
      const image = await tx.generatedImage.create({ data: { ...data, sessionId, createdById: user.id } });
      await tx.usageLog.create({ data: { userId: user.id, imageId: image.id, kind: "DESIGN", day } });
      await tx.generatedImageStyleRefPin.createMany({ data: pinIds.map((pinId) => ({ imageId: image.id, pinId })) });
    }
    return true;
  });
  return { created };
}
