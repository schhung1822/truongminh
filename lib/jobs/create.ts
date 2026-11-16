import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { buildMaterialsList, renderPrompt } from "@/lib/prompts/render";
import { getSettings } from "@/lib/settings";
import { MAX_REFERENCE_IMAGES } from "@/lib/image-options";
import { canEditOwned } from "@/lib/permissions";
import { assertQuota, todayKey } from "./limits";
import { MAX_SHEETS_PER_SESSION, type LayoutSnapshot } from "./snapshot";

type Template = { id: string; version: number; body: string };

export async function getActiveTemplate(kind: "CATALOG" | "DESIGN"): Promise<Template> {
  const t = await db.promptTemplate.findFirst({ where: { kind, isActive: true }, orderBy: { version: "desc" } });
  if (!t) {
    throw new Error(
      `Chưa có prompt ${kind === "CATALOG" ? "catalog" : "thiết kế"} nào đang dùng. Hãy vào Quản trị > Prompt để tạo.`,
    );
  }
  return { id: t.id, version: t.version, body: t.body };
}

type BuiltImage = Omit<Prisma.GeneratedImageUncheckedCreateInput, "sessionId" | "createdById">;

/**
 * Dựng dữ liệu một ảnh catalog từ trang mẫu HIỆN TẠI: chỉ lấy chất liệu đang bật và đã có ảnh tham chiếu,
 * đánh số lại ô liên tục, sinh prompt từ mẫu. Dùng cho cả "tạo phiên" lẫn "tạo lại".
 */
async function buildSheetImage(
  sheetId: string,
  template: Template,
  model: string,
): Promise<{ error: string } | { data: BuiltImage }> {
  const sheet = await db.sheet.findUnique({
    where: { id: sheetId },
    include: { materials: { orderBy: { position: "asc" }, include: { material: true } } },
  });
  if (!sheet) return { error: "Không tìm thấy trang mẫu." };
  if (!sheet.isActive) return { error: `Trang mẫu "${sheet.name}" đang tắt.` };

  const usable = sheet.materials.map((sm) => sm.material).filter((m) => m.isActive && m.referencePath);
  if (usable.length === 0) {
    return { error: `Trang mẫu "${sheet.name}" chưa có chất liệu nào đang bật và có ảnh tham chiếu.` };
  }
  if (1 + usable.length > MAX_REFERENCE_IMAGES) {
    return { error: `Trang mẫu "${sheet.name}" vượt giới hạn ${MAX_REFERENCE_IMAGES} ảnh tham chiếu.` };
  }

  const snapshot: LayoutSnapshot = {
    cols: sheet.cols,
    rows: sheet.rows,
    title: sheet.name,
    cells: usable.map((m) => ({ materialId: m.id, code: m.code, name: m.name })),
  };
  let promptUsed: string;
  try {
    promptUsed = renderPrompt(template.body, {
      cols: sheet.cols,
      rows: sheet.rows,
      materials_list: buildMaterialsList(usable, { cols: sheet.cols, rows: sheet.rows }),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không sinh được prompt." };
  }

  return {
    data: {
      kind: "SHEET",
      sheetId: sheet.id,
      layoutSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      promptUsed,
      promptTemplateId: template.id,
      promptVersion: template.version,
      model,
      resolution: sheet.resolution,
      aspectRatio: sheet.aspectRatio,
    },
  };
}

/** Tạo phiên catalog: một ảnh PENDING cho mỗi trang mẫu được chọn. Việc gọi AI chạy sau (xem kickSession). */
export async function createCatalogSession(
  user: SessionUser,
  input: { logoId: string; sheetIds: string[] },
): Promise<{ error?: string; sessionId?: string }> {
  const sheetIds = [...new Set(input.sheetIds)];
  if (sheetIds.length === 0) return { error: "Vui lòng chọn ít nhất một trang mẫu." };
  if (sheetIds.length > MAX_SHEETS_PER_SESSION) {
    return { error: `Một phiên tối đa ${MAX_SHEETS_PER_SESSION} trang mẫu.` };
  }

  const logo = await db.logo.findUnique({ where: { id: input.logoId } });
  if (!logo) return { error: "Không tìm thấy logo." };

  const quotaError = await assertQuota(user, sheetIds.length);
  if (quotaError) return { error: quotaError };

  const settings = await getSettings();
  let template: Template;
  try {
    template = await getActiveTemplate("CATALOG");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Thiếu prompt." };
  }

  const sheets = await db.sheet.findMany({ where: { id: { in: sheetIds } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const built: BuiltImage[] = [];
  for (const s of sheets) {
    const r = await buildSheetImage(s.id, template, settings.imageModel);
    if ("error" in r) return { error: r.error };
    built.push(r.data);
  }
  if (built.length === 0) return { error: "Không tìm thấy trang mẫu nào để tạo." };

  const day = todayKey();
  const sessionId = await db.$transaction(async (tx) => {
    const session = await tx.consultSession.create({
      data: { type: "CATALOG", logoId: logo.id, createdById: user.id },
    });
    for (const data of built) {
      const image = await tx.generatedImage.create({
        data: { ...data, sessionId: session.id, createdById: user.id },
      });
      await tx.usageLog.create({ data: { userId: user.id, imageId: image.id, kind: "SHEET", day } });
    }
    return session.id;
  });
  return { sessionId };
}

/** "Tạo lại": ảnh mới trỏ về ảnh cũ (parentImageId), dựng từ trạng thái hiện tại. Tính 1 lượt vào hạn mức. */
export async function retryImage(user: SessionUser, imageId: string): Promise<{ error?: string; sessionId?: string }> {
  const old = await db.generatedImage.findUnique({ where: { id: imageId }, include: { retries: { select: { id: true } } } });
  if (!old) return { error: "Không tìm thấy ảnh." };
  if (!canEditOwned(user, old.createdById)) return { error: "Bạn chỉ tạo lại được ảnh do mình tạo." };
  if (old.status === "PENDING" || old.status === "PROCESSING") return { error: "Ảnh này đang được tạo, vui lòng chờ." };
  if (old.retries.length > 0) return { error: "Ảnh này đã được tạo lại. Hãy tải lại trang để thấy bản mới." };

  const quotaError = await assertQuota(user, 1);
  if (quotaError) return { error: quotaError };

  const settings = await getSettings();
  let built: BuiltImage;
  if (old.kind === "SHEET" && old.sheetId) {
    let template: Template;
    try {
      template = await getActiveTemplate("CATALOG");
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Thiếu prompt." };
    }
    const r = await buildSheetImage(old.sheetId, template, settings.imageModel);
    if ("error" in r) return { error: r.error };
    built = r.data;
  } else {
    return { error: "Loại ảnh này chưa hỗ trợ tạo lại." };
  }

  await db.$transaction(async (tx) => {
    const image = await tx.generatedImage.create({
      data: { ...built, sessionId: old.sessionId, createdById: old.createdById, parentImageId: old.id },
    });
    await tx.usageLog.create({ data: { userId: user.id, imageId: image.id, kind: old.kind, day: todayKey() } });
  });
  return { sessionId: old.sessionId };
}
