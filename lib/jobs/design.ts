import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { assignStyles, validateDesignRequest } from "@/lib/design/assign";
import { faceClause } from "@/lib/prompts/face-words";
import { finishKindOf, finishRuleOf } from "@/lib/prompts/finish";
import { renderDesignPrompt, styleReferenceNote } from "@/lib/prompts/render";
import { getSettings, type Settings } from "@/lib/settings";
import { MAX_STYLE_REF_PINS } from "@/lib/image-options";
import type { BuiltImage } from "./built";
import { assertQuota, todayKey } from "./limits";
import { getStyleRefPinIds, type LayoutSnapshot } from "./snapshot";
import { getActiveTemplate, type Template } from "./template";

type MaterialRow = {
  id: string;
  code: string;
  name: string;
  groupName: string;
  printTech: string;
  /** mã công nghệ (khac-laser, cat-laser...): quyết định ảnh vẽ kiểu khắc hay cắt, xem lib/prompts/finish.ts */
  technique?: string | null;
  referencePath: string | null;
};
type StyleRow = { id: string; name: string; description: string };

/** Dựng dữ liệu MỘT ảnh thiết kế: một chất liệu + một kiểu thiết kế + loại sản phẩm + ghi chú. Dùng cho tạo mới và tạo lại. */
/** Ảnh thiết kế luôn có ảnh tham chiếu 1 = logo, 2 = chất liệu; ảnh phong cách tham khảo (nếu có) luôn là ảnh thứ 3. */
const STYLE_REF_INDEX = 3;

/**
 * Câu dặn kiểu hàng cho ảnh thiết kế, kèm màu hai mặt của chất liệu bằng chữ (D123) để AI không lấy nhầm mặt sau làm mặt
 * chính: ảnh tham chiếu chỉ là hai ô trái/phải, thêm chữ là thêm một điểm đối chiếu.
 */
function designFinish(material: Parameters<typeof finishRuleOf>[0] & Parameters<typeof faceClause>[1], badge: boolean): string {
  const faces = faceClause(finishKindOf(material), material);
  return faces ? `${finishRuleOf(material, badge)} Colours of this material, as a cross-check (quoted Vietnamese names are our workshop's labels): ${faces}. Never swap the two faces.` : finishRuleOf(material, badge);
}

export function buildDesignImage(input: {
  material: MaterialRow;
  style: StyleRow;
  variantIndex: number;
  imageNumber: number;
  productType: string;
  note: string;
  template: Template;
  settings: Settings;
  /** logo dạng huy hiệu/bảng (Logo.isBadge): quyết định hình dạng tấm khắc, xem lib/prompts/finish.ts */
  logoIsBadge: boolean;
  /** PinterestPin.id dùng làm ảnh phong cách tham khảo thêm cho AI, tối đa MAX_STYLE_REF_PINS; không bắt buộc */
  styleRefPinIds?: string[];
}): { error: string } | { data: BuiltImage } {
  const { material, style, template, settings } = input;
  if (!material.referencePath) {
    return { error: `Chất liệu ${material.code} chưa có ảnh tham chiếu nên chưa thiết kế được.` };
  }
  let promptUsed: string;
  try {
    promptUsed = renderDesignPrompt(
      template.body,
      {
        product_type: input.productType,
        design_style: `${style.name}: ${style.description}`,
        note: input.note.trim() || "none",
      },
      designFinish(material, input.logoIsBadge),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không sinh được prompt." };
  }
  const styleRefPinIds = input.styleRefPinIds?.slice(0, MAX_STYLE_REF_PINS) ?? [];
  if (styleRefPinIds.length > 0) promptUsed += "\n\n" + styleReferenceNote(STYLE_REF_INDEX, styleRefPinIds.length);

  const snapshot: LayoutSnapshot = {
    cols: 1,
    rows: 1,
    title: `${material.code} - ${material.name}`,
    imageNumber: input.imageNumber,
    cells: [
      {
        materialId: material.id,
        code: material.code,
        name: material.name,
        groupName: material.groupName,
        printTech: material.printTech,
      },
    ],
    design: { productType: input.productType, styleName: style.name, note: input.note, ...(styleRefPinIds.length ? { pinterestPinIds: styleRefPinIds } : {}) },
  };

  return {
    data: {
      kind: "DESIGN",
      materialId: material.id,
      designStyleId: style.id,
      variantIndex: input.variantIndex,
      layoutSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      promptUsed,
      promptTemplateId: template.id,
      promptVersion: template.version,
      model: settings.imageModel,
      resolution: settings.designResolution,
      aspectRatio: settings.designAspectRatio,
    },
  };
}

/**
 * Tạo phiên THIẾT KẾ (bước 2) từ một phiên catalog: với mỗi chất liệu khách chọn tạo N phương án,
 * mỗi phương án một kiểu thiết kế khác nhau lấy từ danh sách admin quản lý. Việc gọi AI chạy sau (kickSession).
 */
export async function createDesignSession(
  user: SessionUser,
  input: { parentSessionId: string; materialIds: string[]; productType: string; variants: number; note: string; styleRefPinIds?: string[] },
): Promise<{ error?: string; sessionId?: string }> {
  const materialIds = [...new Set(input.materialIds)];
  const productType = input.productType.trim().slice(0, 200);
  const note = input.note.trim().slice(0, 1000);
  const styleRefPinIds = [...new Set(input.styleRefPinIds ?? [])].slice(0, MAX_STYLE_REF_PINS);

  const invalid = validateDesignRequest({ materialCount: materialIds.length, variants: input.variants, productType });
  if (invalid) return { error: invalid };

  if (styleRefPinIds.length > 0) {
    const found = await db.pinterestPin.count({ where: { id: { in: styleRefPinIds } } });
    if (found !== styleRefPinIds.length) return { error: "Không tìm thấy một ảnh phong cách tham khảo đã chọn. Hãy chọn lại." };
  }

  const parent = await db.consultSession.findUnique({
    where: { id: input.parentSessionId },
    include: {
      logo: { select: { isBadge: true } },
      images: { where: { status: "SUCCESS", retries: { none: {} } }, select: { layoutSnapshot: true } },
    },
  });
  if (!parent) return { error: "Không tìm thấy phiên." };
  if (parent.type !== "CATALOG") return { error: "Chỉ thiết kế được từ phiên catalog (bước 1)." };

  // chỉ nhận chất liệu thật sự có trong các ảnh catalog đã xong của phiên này
  const allowed = new Set<string>();
  for (const img of parent.images) {
    for (const c of (img.layoutSnapshot as unknown as LayoutSnapshot).cells) allowed.add(c.materialId);
  }
  if (materialIds.some((id) => !allowed.has(id))) return { error: "Có chất liệu không thuộc phiên catalog này." };

  return saveDesignSession(user, { logoId: parent.logoId, parentId: parent.id, logoIsBadge: parent.logo.isBadge, materialIds, productType, variants: input.variants, note, styleRefPinIds });
}

/**
 * Tạo phiên THIẾT KẾ đi thẳng từ một logo với các chất liệu chỉ định sẵn, KHÔNG cần phiên catalog trước (D129). Dùng cho trợ
 * lý Zalo khi làm lại các chất liệu khách từng chọn: chất liệu lấy từ lịch sử của khách chứ không phải từ một ảnh catalog.
 * Phiên tạo ra là phiên DESIGN không có phiên cha, giống phiên thiết kế theo mẫu Pinterest (D125) nhưng không nhờ AI chọn
 * chất liệu. Cột aiAnalysis ghi { direct: true, pinIds } để trang phiên hiện lại các mẫu Pinterest đã dùng làm phong cách.
 */
export async function createDirectDesignSession(
  user: SessionUser,
  input: { logoId: string; materialIds: string[]; productType: string; variants: number; note: string; styleRefPinIds?: string[] },
): Promise<{ error?: string; sessionId?: string }> {
  const materialIds = [...new Set(input.materialIds)];
  const productType = input.productType.trim().slice(0, 200);
  const note = input.note.trim().slice(0, 1000);
  const styleRefPinIds = [...new Set(input.styleRefPinIds ?? [])].slice(0, MAX_STYLE_REF_PINS);

  const invalid = validateDesignRequest({ materialCount: materialIds.length, variants: input.variants, productType });
  if (invalid) return { error: invalid };
  if (styleRefPinIds.length > 0) {
    const found = await db.pinterestPin.count({ where: { id: { in: styleRefPinIds } } });
    if (found !== styleRefPinIds.length) return { error: "Một mẫu Pinterest đã chọn không còn trong thư viện." };
  }
  const logo = await db.logo.findUnique({ where: { id: input.logoId }, select: { id: true, isBadge: true } });
  if (!logo) return { error: "Không tìm thấy logo." };
  const usable = await db.material.count({ where: { id: { in: materialIds }, isActive: true, referencePath: { not: null } } });
  if (usable !== materialIds.length) return { error: "Có chất liệu đã tắt hoặc chưa có ảnh tham chiếu." };

  return saveDesignSession(user, { logoId: logo.id, parentId: null, logoIsBadge: logo.isBadge, materialIds, productType, variants: input.variants, note, styleRefPinIds });
}

/** Phần chung của hai cách tạo phiên thiết kế: dựng ảnh cho từng chất liệu x phương án, kiểm tra hạn mức, lưu phiên và lượt dùng. */
async function saveDesignSession(
  user: SessionUser,
  input: { logoId: string; parentId: string | null; logoIsBadge: boolean; materialIds: string[]; productType: string; variants: number; note: string; styleRefPinIds: string[] },
): Promise<{ error?: string; sessionId?: string }> {
  const { materialIds, productType, note, styleRefPinIds } = input;
  const [materialRows, styles, settings] = await Promise.all([
    db.material.findMany({ where: { id: { in: materialIds } } }),
    db.designStyle.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    getSettings(),
  ]);
  if (styles.length === 0) {
    return { error: "Chưa có kiểu thiết kế nào đang bật. Quản trị viên hãy thêm ở Quản trị > Kiểu thiết kế." };
  }
  // giữ đúng thứ tự sale đã chọn
  const byId = new Map(materialRows.map((m) => [m.id, m]));
  const materials = materialIds.map((id) => byId.get(id)).filter((m): m is NonNullable<typeof m> => !!m);
  if (materials.length !== materialIds.length) return { error: "Có chất liệu không còn tồn tại." };

  const total = materials.length * input.variants;
  const quotaError = await assertQuota(user, total);
  if (quotaError) return { error: quotaError };

  let template: Template;
  try {
    template = await getActiveTemplate("DESIGN");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Thiếu prompt." };
  }

  const plan = assignStyles(materials.length, input.variants, styles.length);
  const built: BuiltImage[] = [];
  let number = 0;
  for (const [mi, material] of materials.entries()) {
    for (let v = 0; v < input.variants; v++) {
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
        logoIsBadge: input.logoIsBadge,
        styleRefPinIds,
      });
      if ("error" in r) return { error: r.error };
      built.push(r.data);
    }
  }

  const day = todayKey();
  const sessionId = await db.$transaction(async (tx) => {
    const session = await tx.consultSession.create({
      data: {
        type: "DESIGN",
        logoId: input.logoId,
        parentId: input.parentId,
        // phiên đi thẳng từ logo (không có phiên cha): ghi lại các mẫu Pinterest đã dùng làm phong cách để trang phiên hiện lại
        ...(input.parentId ? {} : { aiAnalysis: { direct: true, pinIds: styleRefPinIds } }),
        productType,
        variantsPerMaterial: input.variants,
        note: note || null,
        createdById: user.id,
      },
    });
    await tx.sessionSelectedMaterial.createMany({
      data: materials.map((m) => ({ sessionId: session.id, materialId: m.id })),
    });
    for (const data of built) {
      const image = await tx.generatedImage.create({ data: { ...data, sessionId: session.id, createdById: user.id } });
      await tx.usageLog.create({ data: { userId: user.id, imageId: image.id, kind: "DESIGN", day } });
      if (styleRefPinIds.length > 0) {
        await tx.generatedImageStyleRefPin.createMany({ data: styleRefPinIds.map((pinId) => ({ imageId: image.id, pinId })) });
      }
    }
    return session.id;
  });
  return { sessionId };
}

/** Dựng lại dữ liệu cho "Tạo lại" một ảnh thiết kế: cùng chất liệu, cùng kiểu thiết kế, cùng thông số, prompt hiện tại. */
export async function rebuildDesignImage(old: {
  sessionId: string;
  materialId: string | null;
  designStyleId: string | null;
  variantIndex: number;
  layoutSnapshot: unknown;
}): Promise<{ error: string } | { data: BuiltImage }> {
  if (!old.materialId || !old.designStyleId) return { error: "Ảnh thiết kế này thiếu thông tin để tạo lại." };
  const [session, material, style, settings] = await Promise.all([
    db.consultSession.findUnique({ where: { id: old.sessionId }, select: { productType: true, note: true, logo: { select: { isBadge: true } } } }),
    db.material.findUnique({ where: { id: old.materialId } }),
    db.designStyle.findUnique({ where: { id: old.designStyleId } }),
    getSettings(),
  ]);
  if (!session || !material) return { error: "Không còn dữ liệu để tạo lại ảnh này." };
  if (!style) return { error: "Kiểu thiết kế của ảnh này đã bị xóa." };

  let template: Template;
  try {
    template = await getActiveTemplate("DESIGN");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Thiếu prompt." };
  }
  const snap = old.layoutSnapshot as LayoutSnapshot;
  const built = buildDesignImage({
    material,
    style,
    variantIndex: old.variantIndex,
    imageNumber: snap.imageNumber ?? 1,
    productType: session.productType ?? snap.design?.productType ?? "",
    note: session.note ?? "",
    template,
    settings,
    logoIsBadge: session.logo.isBadge,
    styleRefPinIds: getStyleRefPinIds(snap), // giữ nguyên (các) ảnh phong cách tham khảo (nếu có) khi tạo lại
  });
  if ("error" in built || (!snap.labelPos && !snap.labelStyle)) return built;
  // giữ kiểu và vị trí nhãn người dùng đã chọn cho ảnh cũ
  const next = {
    ...(built.data.layoutSnapshot as object),
    ...(snap.labelPos ? { labelPos: snap.labelPos } : {}),
    ...(snap.labelStyle ? { labelStyle: snap.labelStyle } : {}),
  };
  return { data: { ...built.data, layoutSnapshot: next as Prisma.InputJsonValue } };
}
