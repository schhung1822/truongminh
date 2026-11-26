import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ChatError, getChatProvider, text } from "@/lib/ai/chat";
import type { SessionUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { AUTO_SHEET_LAYOUT, AUTO_SHEET_NAME, autoSheetLayout } from "@/lib/image-options";
import { loadOptions } from "@/lib/materials/options";
import { optionLabel } from "@/lib/materials/option-types";
import { buildPickMessages, parsePickResponse, type CatalogMaterial, type LogoAnalysis, type PickSample } from "@/lib/materials/suggest";
import { formatThickness, thicknessClass } from "@/lib/materials/thickness";
import { canEditOwned } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { countSheetTasks, splitIntoImages } from "@/lib/sheets/split";
import { getZaloSettings } from "@/lib/zalo/settings";
import { readAiState, type SessionAiAnalysis, type SessionAiFailed, type SessionAiPending } from "./ai-state";
import type { BuiltImage } from "./built";
import { buildPartImage, totalTasks, usageRows } from "./create";
import { assertQuota, todayKey } from "./limits";
import { kickSession } from "./process";
import { ensureLogoUrl } from "./references";
import { getActiveTemplate, type Template } from "./template";

export type { SessionAiAnalysis } from "./ai-state";

/** AI đọc logo có thể mất 30-60 giây với danh mục vài chục chất liệu. */
const ANALYSIS_TIMEOUT_MS = 120_000;
/** Số lần hỏi AI tối đa cho một lượt phân tích. Đổi số này thì xem lại AI_STALE_MS (lib/jobs/ai-state.ts). */
const MAX_ANALYSIS_ATTEMPTS = 2;

const FAIL = "AI chưa phân tích được logo này. Hãy thử lại, hoặc tạo ảnh bằng cách chọn trang mẫu.";
/** Câu báo chung khi AI không chọn được chất liệu; phiên thiết kế theo mẫu Pinterest (lib/jobs/pin-design.ts) dùng lại. */
export const AI_PICK_FAIL = FAIL;

/** Chất liệu AI được phép chọn: đang bật và đã có ảnh tham chiếu. */
export const USABLE_MATERIAL = { isActive: true, referencePath: { not: null } } as const;

type Actor = Pick<SessionUser, "id" | "role">;

const json = (v: SessionAiAnalysis | SessionAiPending | SessionAiFailed) => v as unknown as Prisma.InputJsonValue;
/** Ghi một trạng thái AI vào cột consult_sessions.aiAnalysis. */
export const aiJson = json;

type UsableMaterialRow = Prisma.MaterialGetPayload<{ include: { styleTags: { select: { value: true } } } }>;
export type AiPickResult = { analysis: LogoAnalysis; rows: UsableMaterialRow[]; model: string; requested: number };

/**
 * Các điều kiện kiểm tra được ngay, không cần gọi AI. Trả về số chất liệu sẽ yêu cầu và chế độ chất lượng, hoặc lỗi.
 * `quality` bỏ trống = theo mặc định ở Quản trị > Cấu hình.
 */
async function precheck(user: Actor, quality?: boolean): Promise<{ requested: number; quality: boolean } | { error: string }> {
  const [settings, usable] = await Promise.all([getSettings(), db.material.count({ where: USABLE_MATERIAL })]);
  if (usable === 0) return { error: "Chưa có chất liệu nào đang bật và có ảnh tham chiếu." };
  const requested = Math.min(settings.autoMaterialCount, usable);
  const useQuality = quality ?? settings.qualityDefault;
  // kiểm tra hạn mức TRƯỚC khi gọi AI phân tích, để không tốn token phân tích rồi mới báo hết lượt.
  // Số lượt = số tác vụ AI: chế độ chất lượng cao (D120) tốn mỗi mảnh 4 chất liệu một lượt.
  const quotaError = await assertQuota(user, countSheetTasks(requested, AUTO_SHEET_LAYOUT.cols, AUTO_SHEET_LAYOUT.rows, useQuality));
  if (quotaError) return { error: quotaError };
  try {
    await getActiveTemplate("CATALOG");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Thiếu prompt." };
  }
  return { requested, quality: useQuality };
}

/**
 * Phiên catalog do AI chọn chất liệu (D115), BƯỚC 1, chạy ngay trong request: kiểm tra nhanh rồi tạo phiên ở trạng thái
 * "AI đang phân tích" và trả về luôn. Phần chậm (AI đọc logo 30-60 giây, dựng ảnh) do runAutoCatalogAnalysis làm ở nền.
 *
 * Trước D119 cả hai phần nằm trong một request dài: sau proxy có giới hạn chờ (nginx mặc định 60 giây, Cloudflare 100 giây)
 * request bị cắt, người dùng thấy lỗi dù máy chủ vẫn chạy tiếp và vẫn trừ lượt. Tách ra thì request luôn xong trong tích tắc.
 * `decideBadge`: logo chưa được đánh dấu "dạng huy hiệu" thì để AI quyết định; logo đã đánh dấu thì giữ nguyên. Từ D126 nơi gọi
 * luôn truyền true vì công tắc tay ở khung logo đã bỏ.
 */
export async function startAutoCatalogSession(
  user: SessionUser,
  /** quality: bật chế độ chất lượng cao (D120); bỏ trống = theo mặc định ở Quản trị > Cấu hình */
  input: { logoId: string; decideBadge: boolean; quality?: boolean },
): Promise<{ error?: string; sessionId?: string }> {
  const logo = await db.logo.findUnique({ where: { id: input.logoId }, select: { id: true } });
  if (!logo) return { error: "Không tìm thấy logo." };
  const pre = await precheck(user, input.quality);
  if ("error" in pre) return pre;

  const pending: SessionAiPending = { status: "ANALYZING", startedAt: new Date().toISOString(), requested: pre.requested, decideBadge: input.decideBadge, quality: pre.quality };
  const session = await db.consultSession.create({ data: { type: "CATALOG", logoId: logo.id, createdById: user.id, aiAnalysis: json(pending) } });
  return { sessionId: session.id };
}

/**
 * Thử lại một phiên AI đã phân tích hỏng (hoặc bị dở quá lâu) mà chưa có ảnh nào: đưa phiên về "đang phân tích".
 * Nơi gọi chạy tiếp runAutoCatalogAnalysis ở nền. Chỉ người tạo phiên hoặc quản trị viên.
 */
export async function retryAutoCatalogSession(user: SessionUser, sessionId: string): Promise<{ error?: string; ok?: true }> {
  const session = await db.consultSession.findUnique({ where: { id: sessionId }, select: { createdById: true, aiAnalysis: true, _count: { select: { images: true } } } });
  if (!session) return { error: "Không tìm thấy phiên." };
  if (!canEditOwned(user, session.createdById)) return { error: "Bạn chỉ thử lại được phiên do mình tạo." };
  const state = readAiState(session.aiAnalysis);
  if (state.kind === "analyzing") return { error: "AI đang phân tích logo này, vui lòng chờ." };
  if (state.kind !== "failed" || session._count.images > 0) return { error: "Phiên này không cần thử lại." };
  const pre = await precheck(user, state.quality);
  if ("error" in pre) return pre;

  const pending: SessionAiPending = { status: "ANALYZING", startedAt: new Date().toISOString(), requested: pre.requested, decideBadge: state.decideBadge, quality: pre.quality };
  await db.consultSession.update({ where: { id: sessionId }, data: { aiAnalysis: json(pending) } });
  return { ok: true };
}

/** Ghi lý do hỏng vào phiên (chỉ khi phiên chưa có ảnh nào), để trang phiên hiện đúng lỗi và nút thử lại. */
export async function markAiFailed(sessionId: string, error: string): Promise<void> {
  try {
    const session = await db.consultSession.findUnique({ where: { id: sessionId }, select: { aiAnalysis: true, _count: { select: { images: true } } } });
    if (!session || session._count.images > 0) return;
    const state = readAiState(session.aiAnalysis);
    if (state.kind === "done" || state.kind === "none") return;
    const failed: SessionAiFailed = { status: "FAILED", error: error.slice(0, 500), failedAt: new Date().toISOString(), requested: state.requested, decideBadge: state.decideBadge, quality: state.quality, ...(state.pinIds.length > 0 ? { pinIds: state.pinIds } : {}) };
    await db.consultSession.update({ where: { id: sessionId }, data: { aiAnalysis: json(failed) } });
  } catch (e) {
    console.error(`AI chọn chất liệu: không ghi được lỗi cho phiên ${sessionId}:`, e);
  }
}

/**
 * BƯỚC 2, chạy NỀN (qua after()) sau khi phiên đã được tạo: AI xem logo, chọn N chất liệu hợp nhất trong các chất liệu đang
 * bật, hệ thống chia thành các ảnh 8 ô, tạo ảnh PENDING kèm lượt dùng rồi đẩy đi tạo như phiên catalog thường.
 * Hỏng ở đâu thì ghi lý do vào phiên, KHÔNG tạo ảnh và KHÔNG trừ lượt. Không bao giờ ném lỗi ra ngoài.
 */
export async function runAutoCatalogAnalysis(sessionId: string): Promise<void> {
  try {
    const r = await analyseAndBuild(sessionId);
    if (r.error) {
      await markAiFailed(sessionId, r.error);
      return;
    }
    if (r.created) await kickSession(sessionId);
  } catch (e) {
    console.error(`AI chọn chất liệu lỗi (phiên ${sessionId}):`, e);
    await markAiFailed(sessionId, FAIL);
  }
}

/**
 * Hỏi AI chọn `requested` chất liệu hợp với logo trong các chất liệu đang bật (dùng chung cho phiên catalog do AI chọn và
 * phiên thiết kế theo mẫu Pinterest). `sample`: mẫu sản phẩm khách thích, ảnh của chúng được gửi kèm sau ảnh logo.
 * Trả về lỗi dạng câu báo cho người dùng, không ném lỗi khi AI hỏng.
 */
export async function askAiForMaterials(input: {
  /** chỉ để ghi log */
  sessionId: string;
  logo: Parameters<typeof ensureLogoUrl>[0];
  requested: number;
  sample?: Omit<PickSample, "images"> & { imageUrls: string[] };
}): Promise<{ error: string } | AiPickResult> {
  const { sessionId } = input;
  const [zalo, rows, options] = await Promise.all([
    getZaloSettings(),
    db.material.findMany({
      where: USABLE_MATERIAL,
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: { styleTags: { select: { value: true } } },
    }),
    loadOptions(),
  ]);
  if (rows.length === 0) return { error: "Chưa có chất liệu nào đang bật và có ảnh tham chiếu." };
  const requested = Math.min(input.requested, rows.length);

  const catalog: CatalogMaterial[] = rows.map((m) => {
    const cls = thicknessClass(m.thicknessMm);
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      group: optionLabel(options, "BASE_MATERIAL", m.baseMaterial) || m.groupName,
      technique: optionLabel(options, "TECHNIQUE", m.technique) || m.printTech,
      finish: optionLabel(options, "SURFACE_FINISH", m.surfaceFinish),
      pattern: optionLabel(options, "SURFACE_PATTERN", m.surfacePattern),
      frontColor: [m.frontColorName, optionLabel(options, "COLOR_FAMILY", m.frontColorFamily)].filter(Boolean).join(" / "),
      backColor: [m.backColorName, optionLabel(options, "COLOR_FAMILY", m.backColorFamily)].filter(Boolean).join(" / "),
      thickness: cls ? `${cls.label} ${formatThickness(m.thicknessMm)}` : "",
      styles: m.styleTags.map((t) => optionLabel(options, "STYLE_TAG", t.value)).filter(Boolean),
      desc: m.descHuman,
    };
  });

  let analysis: LogoAnalysis | null = null;
  const startedAt = Date.now();
  try {
    const logoUrl = await ensureLogoUrl(input.logo);
    const sampleUrls = input.sample?.imageUrls ?? [];
    const { system, user: question } = buildPickMessages({
      count: requested,
      materials: catalog,
      sample: input.sample ? { images: sampleUrls.length, productType: input.sample.productType, techniques: input.sample.techniques } : undefined,
    });
    // AI thỉnh thoảng trả lời sai định dạng tới mức không vớt được: hỏi lại thêm một lần rồi mới báo lỗi (D121)
    for (let attempt = 1; attempt <= MAX_ANALYSIS_ATTEMPTS && !analysis; attempt++) {
      const r = await getChatProvider().complete({
        model: zalo.chatModel,
        messages: [
          { role: "system", content: [text(system)] },
          { role: "user", content: [text(question), { type: "image_url", image_url: { url: logoUrl } }, ...sampleUrls.map((url) => ({ type: "image_url" as const, image_url: { url } }))] },
        ],
        signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
      });
      analysis = parsePickResponse(r.text, catalog, requested);
      if (!analysis) console.error(`AI chọn chất liệu (phiên ${sessionId}, model ${zalo.chatModel}, lần ${attempt}/${MAX_ANALYSIS_ATTEMPTS}): không đọc được câu trả lời:`, r.text.slice(0, 2000));
    }
  } catch (e) {
    // Ghi đủ model và thời gian đã chờ để lần ra nguyên nhân khi chỉ hỏng trên máy chủ
    console.error(`AI chọn chất liệu lỗi (phiên ${sessionId}, model ${zalo.chatModel}, sau ${Math.round((Date.now() - startedAt) / 1000)} giây):`, e);
    return { error: e instanceof ChatError ? `${FAIL} (${e.message})` : FAIL };
  }
  if (!analysis) return { error: `${FAIL} (AI trả lời không đúng định dạng ${MAX_ANALYSIS_ATTEMPTS} lần liên tiếp)` };
  return { analysis, rows, model: zalo.chatModel, requested };
}

async function analyseAndBuild(sessionId: string): Promise<{ error?: string; created?: boolean }> {
  const session = await db.consultSession.findUnique({
    where: { id: sessionId },
    include: { logo: true, createdBy: { select: { id: true, role: true } }, _count: { select: { images: true } } },
  });
  if (!session || session.type !== "CATALOG") return {}; // phiên thiết kế theo mẫu Pinterest do lib/jobs/pin-design.ts xử lý
  const state = readAiState(session.aiAnalysis);
  if (state.kind !== "analyzing" || session._count.images > 0) return {}; // đã xong, đã hỏng hoặc đang do lượt khác xử lý
  const { logo, createdBy: user } = session;

  const settings = await getSettings();
  let template: Template;
  try {
    template = await getActiveTemplate("CATALOG");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Thiếu prompt." };
  }

  const asked = await askAiForMaterials({ sessionId, logo, requested: state.requested || settings.autoMaterialCount });
  if ("error" in asked) return asked;
  const { analysis, rows, requested } = asked;

  const isBadge = state.decideBadge && !logo.isBadge ? analysis.isBadge : logo.isBadge;
  const byId = new Map(rows.map((m) => [m.id, m]));
  const picked = analysis.picks.map((p) => byId.get(p.materialId)).filter((m): m is NonNullable<typeof m> => !!m);
  const parts = splitIntoImages(picked, AUTO_SHEET_LAYOUT.cols, AUTO_SHEET_LAYOUT.rows);
  // Ảnh thường: 8 ô chia theo hình dạng logo (logo gần vuông dùng ô cao, logo ngang dùng ô dẹt) để logo to nhất có thể.
  // Ảnh chất lượng cao bỏ qua bố cục này (luôn là các mảnh 2 x 2 ghép thành 2 cột).
  const layout = autoSheetLayout(logo.width, logo.height);

  const built: BuiltImage[] = [];
  for (const [i, materials] of parts.entries()) {
    const r = buildPartImage(
      { sheetId: null, name: AUTO_SHEET_NAME, cols: layout.cols, rows: layout.rows, resolution: settings.defaultResolution, aspectRatio: layout.aspectRatio },
      materials,
      template,
      settings.imageModel,
      i + 1,
      { index: i + 1, total: parts.length },
      isBadge,
      undefined,
      { quality: state.quality },
    );
    if ("error" in r) return { error: r.error };
    built.push(r.data);
  }
  if (built.length === 0) return { error: `${FAIL} (AI không chọn được chất liệu nào)` };

  // Trong lúc AI phân tích người này có thể đã dùng hết lượt ở phiên khác: kiểm tra lại ngay trước khi tạo ảnh
  const quotaError = await assertQuota(user, totalTasks(built));
  if (quotaError) return { error: quotaError };

  const done: SessionAiAnalysis = { status: "DONE", summary: analysis.summary, isBadge: analysis.isBadge, model: asked.model, requested, picks: analysis.picks };
  const day = todayKey();
  const created = await db.$transaction(async (tx) => {
    // chống tạo trùng nếu việc nền bị gọi hai lần cho cùng một phiên
    const fresh = await tx.consultSession.findUnique({ where: { id: sessionId }, select: { aiAnalysis: true, _count: { select: { images: true } } } });
    if (!fresh || fresh._count.images > 0 || readAiState(fresh.aiAnalysis).kind !== "analyzing") return false;
    if (isBadge !== logo.isBadge) await tx.logo.update({ where: { id: logo.id }, data: { isBadge } });
    await tx.consultSession.update({ where: { id: sessionId }, data: { aiAnalysis: json(done) } });
    for (const data of built) {
      const image = await tx.generatedImage.create({ data: { ...data, sessionId, createdById: user.id } });
      await tx.usageLog.createMany({ data: usageRows(user.id, image.id, "SHEET", day, data.tiles) });
    }
    return true;
  });
  return { created };
}
