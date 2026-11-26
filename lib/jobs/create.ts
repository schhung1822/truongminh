import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/dal";
import { rebuildDesignImage } from "./design";
import type { BuiltImage } from "./built";
import { getActiveTemplate, type Template } from "./template";
import { db } from "@/lib/db";
import { buildMaterialsList, renderPrompt } from "@/lib/prompts/render";
import { getSettings } from "@/lib/settings";
import { ALL_MATERIALS_SHEET_NAME, AUTO_SHEET_LAYOUT, AUTO_SHEET_NAME, autoSheetLayout, MAX_REFERENCE_IMAGES } from "@/lib/image-options";
import type { LabelPos, LabelStyle } from "@/lib/imaging/label-pos";
import { partTitle, splitIntoImages } from "@/lib/sheets/split";
import { combinedPrompt, planTiles, stitchedAspect, stitchedGrid, taskCount, TILE_COLS, TILE_ROWS, type ImageTile } from "./tiles";
import { canEditOwned } from "@/lib/permissions";
import { fallbackImageNumber } from "./finish";
import { assertQuota, todayKey } from "./limits";
import { getStyleRefPinIds, MAX_IMAGES_PER_SESSION, type LayoutSnapshot } from "./snapshot";

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

/** Bố cục của một ảnh catalog: lấy từ trang mẫu, hoặc cố định cho phiên AI chọn chất liệu (sheetId = null, D115). */
export type PartLayout = { sheetId: string | null; name: string; cols: number; rows: number; resolution: string; aspectRatio: string };
/** Các trường màu hai mặt (không bắt buộc) được ghi vào prompt để AI không tráo ô và không khắc nhầm mặt (D123). */
export type PartMaterial = {
  id: string;
  code: string;
  name: string;
  groupName: string;
  printTech: string;
  technique?: string | null;
  frontColorName?: string | null;
  frontColorFamily?: string | null;
  backColorName?: string | null;
  backColorFamily?: string | null;
  surfaceFinish?: string | null;
};

const sheetLayout = (sheet: SheetRow): PartLayout => ({
  sheetId: sheet.id,
  name: sheet.name,
  cols: sheet.cols,
  rows: sheet.rows,
  resolution: sheet.resolution,
  aspectRatio: sheet.aspectRatio,
});

/** Dựng dữ liệu một ảnh catalog (một đoạn chất liệu của trang mẫu hoặc của danh sách AI chọn): đánh số ô liên tục, sinh prompt từ mẫu. */
export function buildPartImage(
  sheet: PartLayout,
  materials: PartMaterial[],
  template: Template,
  model: string,
  imageNumber: number | undefined,
  part: { index: number; total: number },
  /** logo dạng huy hiệu/bảng (Logo.isBadge): quyết định hình dạng tấm khắc, xem lib/prompts/finish.ts */
  logoIsBadge: boolean,
  label?: { pos?: LabelPos; style?: LabelStyle },
  /** quality = chế độ chất lượng cao (D120): AI vẽ từng mảnh 2 x 2 rồi ghép thành ảnh 2 cột; bỏ qua cols/rows/tỉ lệ của trang mẫu */
  opts: { quality?: boolean } = {},
): { error: string } | { data: BuiltImage } {
  const quality = opts.quality === true && materials.length > 0;
  const grid = quality ? stitchedGrid(materials.length) : { cols: sheet.cols, rows: sheet.rows };
  const snapshot: LayoutSnapshot = {
    cols: grid.cols,
    rows: grid.rows,
    title: partTitle(sheet.name, part.index, part.total),
    imageNumber,
    ...(quality ? { quality: true } : {}),
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
  let tiles: ImageTile[] | null = null;
  try {
    if (quality) {
      // mỗi mảnh có prompt riêng cho lưới 2 x 2 của nó: ảnh tham chiếu số 1 vẫn là logo, ô thứ k của MẢNH ứng với ảnh số k + 1
      tiles = planTiles(materials.length).map((t) => ({
        ...t,
        prompt: renderPrompt(template.body, {
          cols: TILE_COLS,
          rows: TILE_ROWS,
          materials_list: buildMaterialsList(materials.slice(t.from, t.from + t.count), { cols: TILE_COLS, rows: TILE_ROWS }, { badge: logoIsBadge }),
        }),
      }));
      promptUsed = combinedPrompt(tiles);
    } else {
      promptUsed = renderPrompt(template.body, {
        cols: sheet.cols,
        rows: sheet.rows,
        materials_list: buildMaterialsList(materials, { cols: sheet.cols, rows: sheet.rows }, { badge: logoIsBadge }),
      });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không sinh được prompt." };
  }

  return {
    data: {
      kind: "SHEET",
      sheetId: sheet.sheetId,
      layoutSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      promptUsed,
      promptTemplateId: template.id,
      promptVersion: template.version,
      model,
      resolution: sheet.resolution,
      // ảnh chất lượng cao: tỉ lệ của phần ảnh AI SAU khi ghép (mỗi mảnh gửi AI luôn là khung vuông)
      aspectRatio: tiles ? stitchedAspect(materials.length) : sheet.aspectRatio,
      ...(tiles ? { tiles: tiles as unknown as Prisma.InputJsonValue } : {}),
    },
  };
}

/** Tổng số tác vụ AI (= số lượt tính vào hạn mức) của các ảnh sắp tạo. */
export function totalTasks(images: BuiltImage[]): number {
  return images.reduce((n, b) => n + taskCount(b.tiles), 0);
}

/** Ghi lượt dùng cho một ảnh vừa tạo: mỗi tác vụ AI một dòng (ảnh chất lượng cao có nhiều dòng). */
export function usageRows(userId: string, imageId: string, kind: "SHEET" | "DESIGN", day: string, tiles: unknown) {
  return Array.from({ length: taskCount(tiles) }, () => ({ userId, imageId, kind, day }));
}

/**
 * Tạo phiên catalog: một ảnh PENDING cho mỗi đoạn chất liệu của mỗi trang mẫu được chọn
 * (trang ngắn = một ảnh, trang dài tự chia thành nhiều ảnh). Việc gọi AI chạy sau (xem kickSession).
 */
export async function createCatalogSession(
  user: SessionUser,
  /** quality: bật chế độ chất lượng cao (D120); bỏ trống = theo mặc định ở Quản trị > Cấu hình */
  input: { logoId: string; sheetIds: string[]; quality?: boolean },
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
  const settings = await getSettings();
  const quality = input.quality ?? settings.qualityDefault;
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
      const r = buildPartImage(sheetLayout(sheet), materials, template, settings.imageModel, built.length + 1, { index: i + 1, total: parts.length }, logo.isBadge, undefined, { quality });
      if ("error" in r) return { error: r.error };
      built.push(r.data);
    }
  }
  // hạn mức tính theo số tác vụ AI: ảnh chất lượng cao tốn mỗi mảnh một lượt
  const quotaError = await assertQuota(user, totalTasks(built));
  if (quotaError) return { error: quotaError };

  const day = todayKey();
  const sessionId = await db.$transaction(async (tx) => {
    const session = await tx.consultSession.create({
      data: { type: "CATALOG", logoId: logo.id, createdById: user.id },
    });
    for (const data of built) {
      const image = await tx.generatedImage.create({
        data: { ...data, sessionId: session.id, createdById: user.id },
      });
      await tx.usageLog.createMany({ data: usageRows(user.id, image.id, "SHEET", day, data.tiles) });
    }
    return session.id;
  });
  return { sessionId };
}

/**
 * Phiên ảnh mẫu với TẤT CẢ chất liệu đang bật và có ảnh tham chiếu (nút "Tất cả chất liệu", D126), không cần trang mẫu:
 * xếp theo thứ tự chất liệu ở Quản trị, chia 8 ô mỗi ảnh, bố cục ô theo hình dạng logo như phiên AI chọn chất liệu.
 */
export async function createAllMaterialsSession(
  user: SessionUser,
  /** quality: bật chế độ chất lượng cao (D120); bỏ trống = theo mặc định ở Quản trị > Cấu hình */
  input: { logoId: string; quality?: boolean },
): Promise<{ error?: string; sessionId?: string }> {
  const logo = await db.logo.findUnique({ where: { id: input.logoId } });
  if (!logo) return { error: "Không tìm thấy logo." };

  const materials = await db.material.findMany({ where: { isActive: true, referencePath: { not: null } }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
  if (materials.length === 0) return { error: "Chưa có chất liệu nào đang bật và có ảnh tham chiếu." };
  const parts = splitIntoImages(materials, AUTO_SHEET_LAYOUT.cols, AUTO_SHEET_LAYOUT.rows);
  if (parts.length > MAX_IMAGES_PER_SESSION) {
    return { error: `Tất cả ${materials.length} chất liệu sẽ tạo ${parts.length} ảnh, một phiên tối đa ${MAX_IMAGES_PER_SESSION} ảnh. Hãy dùng "Chọn bộ chất liệu" để tạo từng phần.` };
  }

  const settings = await getSettings();
  const quality = input.quality ?? settings.qualityDefault;
  let template: Template;
  try {
    template = await getActiveTemplate("CATALOG");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Thiếu prompt." };
  }

  const layout = autoSheetLayout(logo.width, logo.height);
  const built: BuiltImage[] = [];
  for (const [i, part] of parts.entries()) {
    const r = buildPartImage(
      { sheetId: null, name: ALL_MATERIALS_SHEET_NAME, cols: layout.cols, rows: layout.rows, resolution: settings.defaultResolution, aspectRatio: layout.aspectRatio },
      part,
      template,
      settings.imageModel,
      i + 1,
      { index: i + 1, total: parts.length },
      logo.isBadge,
      undefined,
      { quality },
    );
    if ("error" in r) return { error: r.error };
    built.push(r.data);
  }
  // hạn mức tính theo số tác vụ AI: ảnh chất lượng cao tốn mỗi mảnh một lượt
  const quotaError = await assertQuota(user, totalTasks(built));
  if (quotaError) return { error: quotaError };

  const day = todayKey();
  const sessionId = await db.$transaction(async (tx) => {
    const session = await tx.consultSession.create({ data: { type: "CATALOG", logoId: logo.id, createdById: user.id } });
    for (const data of built) {
      const image = await tx.generatedImage.create({ data: { ...data, sessionId: session.id, createdById: user.id } });
      await tx.usageLog.createMany({ data: usageRows(user.id, image.id, "SHEET", day, data.tiles) });
    }
    return session.id;
  });
  return { sessionId };
}

/** "Tạo lại": ảnh mới trỏ về ảnh cũ (parentImageId), dựng từ trạng thái hiện tại. Tính 1 lượt (ảnh chất lượng cao: mỗi mảnh 1 lượt). */
export async function retryImage(user: SessionUser, imageId: string): Promise<{ error?: string; sessionId?: string }> {
  const old = await db.generatedImage.findUnique({ where: { id: imageId }, include: { retries: { select: { id: true } } } });
  if (!old) return { error: "Không tìm thấy ảnh." };
  if (!canEditOwned(user, old.createdById)) return { error: "Bạn chỉ tạo lại được ảnh do mình tạo." };
  if (old.status === "PENDING" || old.status === "PROCESSING") return { error: "Ảnh này đang được tạo, vui lòng chờ." };
  if (old.retries.length > 0) return { error: "Ảnh này đã được tạo lại. Hãy tải lại trang để thấy bản mới." };

  const settings = await getSettings();
  // ảnh cũ tạo ở chế độ chất lượng cao thì bản tạo lại cũng vậy
  const quality = (old.layoutSnapshot as unknown as LayoutSnapshot).quality === true;
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
    const session = await db.consultSession.findUnique({ where: { id: old.sessionId }, select: { logo: { select: { isBadge: true } } } });
    const r = buildPartImage(
      sheetLayout(loaded.sheet),
      loaded.parts[0],
      template,
      settings.imageModel,
      oldNumber,
      oldSnap.part ?? { index: 1, total: 1 },
      session?.logo.isBadge ?? false,
      { pos: oldSnap.labelPos, style: oldSnap.labelStyle },
      { quality },
    );
    if ("error" in r) return { error: r.error };
    built = r.data;
  } else if (old.kind === "SHEET") {
    // Ảnh của phiên AI chọn chất liệu (không thuộc trang mẫu nào, D115): dựng lại từ đúng các chất liệu của ảnh cũ còn dùng được,
    // giữ bố cục, số thứ tự và nhãn; prompt và ô "logo dạng huy hiệu" lấy theo hiện tại như mọi lần tạo lại khác.
    let template: Template;
    try {
      template = await getActiveTemplate("CATALOG");
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Thiếu prompt." };
    }
    const oldSnap = old.layoutSnapshot as unknown as LayoutSnapshot;
    const oldIds = oldSnap.cells.map((c) => c.materialId);
    const [rows, session] = await Promise.all([
      db.material.findMany({ where: { id: { in: oldIds }, isActive: true, referencePath: { not: null } } }),
      db.consultSession.findUnique({ where: { id: old.sessionId }, select: { logo: { select: { isBadge: true } } } }),
    ]);
    const byId = new Map(rows.map((m) => [m.id, m]));
    const materials = oldIds.map((id) => byId.get(id)).filter((m): m is NonNullable<typeof m> => !!m);
    if (materials.length === 0) return { error: "Các chất liệu của ảnh này không còn dùng được, hãy tạo phiên mới." };
    const r = buildPartImage(
      { sheetId: null, name: AUTO_SHEET_NAME, cols: oldSnap.cols, rows: oldSnap.rows, resolution: old.resolution, aspectRatio: old.aspectRatio },
      materials,
      template,
      settings.imageModel,
      oldSnap.imageNumber ?? (await fallbackImageNumber(old.sessionId, old.id)),
      oldSnap.part ?? { index: 1, total: 1 },
      session?.logo.isBadge ?? false,
      { pos: oldSnap.labelPos, style: oldSnap.labelStyle },
      { quality },
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

  const quotaError = await assertQuota(user, taskCount(built.tiles));
  if (quotaError) return { error: quotaError };

  await db.$transaction(async (tx) => {
    const image = await tx.generatedImage.create({
      data: { ...built, sessionId: old.sessionId, createdById: old.createdById, parentImageId: old.id },
    });
    await tx.usageLog.createMany({ data: usageRows(user.id, image.id, old.kind, todayKey(), built.tiles) });
    if (old.kind === "DESIGN") {
      const styleRefPinIds = getStyleRefPinIds(built.layoutSnapshot as unknown as LayoutSnapshot);
      if (styleRefPinIds.length > 0) {
        await tx.generatedImageStyleRefPin.createMany({ data: styleRefPinIds.map((pinId) => ({ imageId: image.id, pinId })) });
      }
    }
  });
  return { sessionId: old.sessionId };
}
