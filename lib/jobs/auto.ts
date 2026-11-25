import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ChatError, getChatProvider, text } from "@/lib/ai/chat";
import type { SessionUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { AUTO_SHEET_LAYOUT, AUTO_SHEET_NAME } from "@/lib/image-options";
import { loadOptions } from "@/lib/materials/options";
import { optionLabel } from "@/lib/materials/option-types";
import { buildPickMessages, parsePickResponse, type CatalogMaterial, type LogoAnalysis } from "@/lib/materials/suggest";
import { formatThickness, thicknessClass } from "@/lib/materials/thickness";
import { getSettings } from "@/lib/settings";
import { splitIntoImages } from "@/lib/sheets/split";
import { getZaloSettings } from "@/lib/zalo/settings";
import type { BuiltImage } from "./built";
import { buildPartImage } from "./create";
import { assertQuota, todayKey } from "./limits";
import { ensureLogoUrl } from "./references";
import { getActiveTemplate, type Template } from "./template";

/** Nội dung lưu ở consult_sessions.aiAnalysis: nhận xét logo và lý do chọn từng chất liệu của phiên AI chọn. */
export type SessionAiAnalysis = {
  summary: string;
  isBadge: boolean;
  model: string;
  /** số chất liệu được yêu cầu (cấu hình lúc tạo) */
  requested: number;
  picks: { materialId: string; code: string; name: string; reason: string }[];
};

/** AI đọc logo có thể mất 30-60 giây với danh mục vài chục chất liệu. */
const ANALYSIS_TIMEOUT_MS = 120_000;

const FAIL = "AI chưa phân tích được logo này. Hãy thử lại, hoặc tạo ảnh bằng cách chọn trang mẫu.";

/**
 * Phiên catalog do AI chọn chất liệu (D115): AI xem logo, chọn N chất liệu hợp nhất trong các chất liệu đang bật (N ở Quản
 * trị > Cấu hình), hệ thống chia thành các ảnh 8 ô và tạo như phiên catalog thường (ảnh PENDING, gọi AI tạo ảnh sau).
 * `decideBadge`: logo vừa tải lên và người dùng không tick "dạng huy hiệu" thì để AI quyết định ô đó; logo có sẵn thì giữ nguyên.
 * AI lỗi hoặc trả lời không đọc được thì KHÔNG tạo gì, trả lỗi để người dùng chọn trang mẫu theo cách thường.
 */
export async function createAutoCatalogSession(
  user: SessionUser,
  input: { logoId: string; decideBadge: boolean },
): Promise<{ error?: string; sessionId?: string }> {
  const logo = await db.logo.findUnique({ where: { id: input.logoId } });
  if (!logo) return { error: "Không tìm thấy logo." };

  const [settings, zalo, rows, options] = await Promise.all([
    getSettings(),
    getZaloSettings(),
    db.material.findMany({
      where: { isActive: true, referencePath: { not: null } },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: { styleTags: { select: { value: true } } },
    }),
    loadOptions(),
  ]);
  if (rows.length === 0) return { error: "Chưa có chất liệu nào đang bật và có ảnh tham chiếu." };

  const perImage = AUTO_SHEET_LAYOUT.cols * AUTO_SHEET_LAYOUT.rows;
  const requested = Math.min(settings.autoMaterialCount, rows.length);
  // kiểm tra hạn mức TRƯỚC khi gọi AI phân tích, để không tốn token phân tích rồi mới báo hết lượt
  const quotaError = await assertQuota(user, Math.ceil(requested / perImage));
  if (quotaError) return { error: quotaError };

  let template: Template;
  try {
    template = await getActiveTemplate("CATALOG");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Thiếu prompt." };
  }

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

  let analysis: LogoAnalysis | null;
  try {
    const logoUrl = await ensureLogoUrl(logo);
    const { system, user: question } = buildPickMessages({ count: requested, materials: catalog });
    const r = await getChatProvider().complete({
      model: zalo.chatModel,
      messages: [
        { role: "system", content: [text(system)] },
        { role: "user", content: [text(question), { type: "image_url", image_url: { url: logoUrl } }] },
      ],
      signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
    });
    analysis = parsePickResponse(r.text, catalog, requested);
  } catch (e) {
    console.error("AI chọn chất liệu lỗi:", e);
    return { error: e instanceof ChatError ? `${FAIL} (${e.message})` : FAIL };
  }
  if (!analysis) return { error: FAIL };

  const isBadge = input.decideBadge && !logo.isBadge ? analysis.isBadge : logo.isBadge;
  const byId = new Map(rows.map((m) => [m.id, m]));
  const picked = analysis.picks.map((p) => byId.get(p.materialId)).filter((m): m is NonNullable<typeof m> => !!m);
  const parts = splitIntoImages(picked, AUTO_SHEET_LAYOUT.cols, AUTO_SHEET_LAYOUT.rows);

  const built: BuiltImage[] = [];
  for (const [i, materials] of parts.entries()) {
    const r = buildPartImage(
      { sheetId: null, name: AUTO_SHEET_NAME, cols: AUTO_SHEET_LAYOUT.cols, rows: AUTO_SHEET_LAYOUT.rows, resolution: settings.defaultResolution, aspectRatio: AUTO_SHEET_LAYOUT.aspectRatio },
      materials,
      template,
      settings.imageModel,
      i + 1,
      { index: i + 1, total: parts.length },
      isBadge,
    );
    if ("error" in r) return { error: r.error };
    built.push(r.data);
  }

  const aiAnalysis: SessionAiAnalysis = { summary: analysis.summary, isBadge: analysis.isBadge, model: zalo.chatModel, requested, picks: analysis.picks };
  const day = todayKey();
  const sessionId = await db.$transaction(async (tx) => {
    if (isBadge !== logo.isBadge) await tx.logo.update({ where: { id: logo.id }, data: { isBadge } });
    const session = await tx.consultSession.create({
      data: { type: "CATALOG", logoId: logo.id, createdById: user.id, aiAnalysis: aiAnalysis as unknown as Prisma.InputJsonValue },
    });
    for (const data of built) {
      const image = await tx.generatedImage.create({ data: { ...data, sessionId: session.id, createdById: user.id } });
      await tx.usageLog.create({ data: { userId: user.id, imageId: image.id, kind: "SHEET", day } });
    }
    return session.id;
  });
  return { sessionId };
}
