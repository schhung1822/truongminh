import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/dal";
import { rebuildDesignImage } from "./design";
import type { BuiltImage } from "./built";
import { getActiveTemplate, type Template } from "./template";
import { db } from "@/lib/db";
import { buildMaterialsList, renderPrompt } from "@/lib/prompts/render";
import { getSettings } from "@/lib/settings";
import { MAX_REFERENCE_IMAGES } from "@/lib/image-options";
import type { LabelPos, LabelStyle } from "@/lib/imaging/label-pos";
import { partTitle, splitIntoImages } from "@/lib/sheets/split";
import { canEditOwned } from "@/lib/permissions";
import { fallbackImageNumber } from "./finish";
import { assertQuota, todayKey } from "./limits";
import { MAX_IMAGES_PER_SESSION, type LayoutSnapshot } from "./snapshot";

type SheetRow = NonNullable<Awaited<ReturnType<typeof findSheet>>>;
type UsableMaterial = SheetRow["materials"][number]["material"];

function findSheet(sheetId: string) {
  return db.sheet.findUnique({
    where: { id: sheetId },
    include: { materials: { orderBy: { position: "asc" }, include: { material: true } } },
  });
}

/**
 * Các ảnh sẽ tạo từ trang mẫu HIỆN TẠI: chỉ lấy chất liệu đang bật và đã có ảnh tham chiếu (theo thứ tự trong trang),
 * rồi cắt thành từng ảnh theo số ô của bố cục. Trang ngắn ra một ảnh; trang dài (ví dụ 80 chất liệu, 8 ô) ra nhiều ảnh.
 * `onlyMaterialIds`: chỉ xét các chất liệu này (dùng khi tạo lại đúng một ảnh của trang dài).
 */
async function loadSheetParts(
  sheetId: string,
  onlyMaterialIds?: string[],
): Promise<{ error: string } | { sheet: SheetRow; parts: UsableMaterial[][] }> {
  const sheet = await findSheet(sheetId);
  if (!sheet) return { error: "Không tìm thấy trang mẫu." };
  if (!sheet.isActive) return { error: `Trang mẫu "${sheet.name}" đang tắt.` };

  const only = onlyMaterialIds ? new Set(onlyMaterialIds) : null;
  const usable = sheet.materials
    .map((sm) => sm.material)
    .filter((m) => m.isActive && m.referencePath && (!only || only.has(m.id)));
  if (usable.length === 0) {
    return { error: `Trang mẫu "${sheet.name}" chưa có chất liệu nào đang bật và có ảnh tham chiếu.` };
  }
  const parts = splitIntoImages(usable, sheet.cols, sheet.rows);
  if (1 + parts[0].length > MAX_REFERENCE_IMAGES) {
    return { error: `Trang mẫu "${sheet.name}" vượt giới hạn ${MAX_REFERENCE_IMAGES} ảnh tham chiếu.` };
  }
  return { sheet, parts };
}

/** Dựng dữ liệu một ảnh catalog (một đoạn chất liệu của trang mẫu): đánh số ô liên tục, sinh prompt từ mẫu. */
function buildPartImage(
  sheet: SheetRow,
  materials: UsableMaterial[],
  template: Template,
  model: string,
  imageNumber: number | undefined,
  part: { index: number; total: number },
  label?: { pos?: LabelPos; style?: LabelStyle },
): { error: string } | { data: BuiltImage } {
  const snapshot: LayoutSnapshot = {
    cols: sheet.cols,
    rows: sheet.rows,
    title: partTitle(sheet.name, part.index, part.total),
    imageNumber,
    ...(part.total > 1 ? { part } : {}),
    ...(label?.pos ? { labelPos: label.pos } : {}),
    ...(label?.style ? { labelStyle: label.style } : {}),
    cells: materials.map((m) => ({
      materialId: m.id,
      code: m.code,
      name: m.name,
      groupName: m.groupName,
      printTech: m.printTech,
    })),
  };
  let promptUsed: string;
  try {
    promptUsed = renderPrompt(template.body, {
      cols: sheet.cols,
      rows: sheet.rows,
      materials_list: buildMaterialsList(materials, { cols: sheet.cols, rows: sheet.rows }),
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

/**
 * Tạo phiên catalog: một ảnh PENDING cho mỗi đoạn chất liệu của mỗi trang mẫu được chọn
 * (trang ngắn = một ảnh, trang dài tự chia thành nhiều ảnh). Việc gọi AI chạy sau (xem kickSession).
 */
export async function createCatalogSession(
  user: SessionUser,
  input: { logoId: string; sheetIds: string[] },
): Promise<{ error?: string; sessionId?: string }> {
  const sheetIds = [...new Set(input.sheetIds)];
  if (sheetIds.length === 0) return { error: "Vui lòng chọn ít nhất một trang mẫu." };
  if (sheetIds.length > MAX_IMAGES_PER_SESSION) {
    return { error: `Một phiên tối đa ${MAX_IMAGES_PER_SESSION} ảnh.` };
  }

  const logo = await db.logo.findUnique({ where: { id: input.logoId } });
  if (!logo) return { error: "Không tìm thấy logo." };

  const sheets = await db.sheet.findMany({ where: { id: { in: sheetIds } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  if (sheets.length === 0) return { error: "Không tìm thấy trang mẫu nào để tạo." };
  const loaded: { sheet: SheetRow; parts: UsableMaterial[][] }[] = [];
  for (const s of sheets) {
    const r = await loadSheetParts(s.id);
    if ("error" in r) return { error: r.error };
    loaded.push(r);
  }

  const totalImages = loaded.reduce((n, l) => n + l.parts.length, 0);
  if (totalImages > MAX_IMAGES_PER_SESSION) {
    return {
      error: `Các trang mẫu đã chọn sẽ tạo ${totalImages} ảnh, một phiên tối đa ${MAX_IMAGES_PER_SESSION} ảnh. Hãy chọn ít trang hơn.`,
    };
  }
  const quotaError = await assertQuota(user, totalImages);
  if (quotaError) return { error: quotaError };

  const settings = await getSettings();
  let template: Template;
  try {
    template = await getActiveTemplate("CATALOG");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Thiếu prompt." };
  }

  const built: BuiltImage[] = [];
  for (const { sheet, parts } of loaded) {
    for (const [i, materials] of parts.entries()) {
      // số thứ tự ảnh trong phiên chạy liên tục qua các trang mẫu: Ảnh 1, Ảnh 2...
      const r = buildPartImage(sheet, materials, template, settings.imageModel, built.length + 1, { index: i + 1, total: parts.length });
      if ("error" in r) return { error: r.error };
      built.push(r.data);
    }
  }

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
    // tạo lại giữ nguyên số thứ tự của ảnh cũ
    const oldNumber =
      (old.layoutSnapshot as unknown as LayoutSnapshot).imageNumber ?? (await fallbackImageNumber(old.sessionId, old.id));
    const oldSnap = old.layoutSnapshot as unknown as LayoutSnapshot;
    const oldIds = oldSnap.cells.map((c) => c.materialId);
    // ảnh thuộc trang dài (chia nhiều ảnh) thì chỉ tạo lại đúng đoạn chất liệu của ảnh đó; ảnh của trang ngắn dựng lại từ cả trang như cũ
    let loaded = await loadSheetParts(old.sheetId, oldSnap.part ? oldIds : undefined);
    // trang vừa được sửa dài ra: giữ đúng các chất liệu của ảnh cũ thay vì tạo thêm ảnh ngoài ý muốn
    if (!("error" in loaded) && loaded.parts.length > 1) loaded = await loadSheetParts(old.sheetId, oldIds);
    if ("error" in loaded) return { error: loaded.error };
    if (loaded.parts.length !== 1) return { error: "Trang mẫu đã đổi bố cục, hãy tạo phiên mới thay vì tạo lại ảnh này." };
    const r = buildPartImage(
      loaded.sheet,
      loaded.parts[0],
      template,
      settings.imageModel,
      oldNumber,
      oldSnap.part ?? { index: 1, total: 1 },
      { pos: oldSnap.labelPos, style: oldSnap.labelStyle },
    );
    if ("error" in r) return { error: r.error };
    built = r.data;
  } else if (old.kind === "DESIGN") {
    const r = await rebuildDesignImage(old);
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
