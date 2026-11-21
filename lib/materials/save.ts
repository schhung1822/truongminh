import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { composeReference, processMaterialImage, type ProcessedImage } from "@/lib/imaging/material-images";
import { getStorage } from "@/lib/storage";
import { materialKey, type MaterialImageRole } from "@/lib/storage/keys";
import { toWebp } from "@/lib/imaging/webp";
import { normalizeClassification, requireBasics, type ClassifyPatch } from "./classify";
import { loadOptions } from "./options";
import { parseThickness } from "./thickness";

export type SaveResult = { ok: true; id: string } | { ok: false; error: string; status: number };

const fieldsSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập mã chất liệu.")
    .max(50, "Mã tối đa 50 ký tự.")
    .regex(/^[^/\\]+$/, "Mã không được chứa dấu / hoặc \\."),
  name: z.string().trim().min(1, "Vui lòng nhập tên gọi.").max(100, "Tên tối đa 100 ký tự."),
  descHuman: z.string().trim().max(2000, "Mô tả tối đa 2000 ký tự.").default(""),
  sortOrder: z.coerce.number().int("Thứ tự phải là số nguyên.").min(0).max(100000).default(0),
});

function file(form: FormData, name: string): File | null {
  const v = form.get(name);
  return v instanceof File && v.size > 0 ? v : null;
}

const fail = (error: string, status = 400): SaveResult => ({ ok: false, error, status });

/** Thay toàn bộ tag phong cách của một chất liệu. */
export async function replaceStyleTags(materialId: string, values: string[]): Promise<void> {
  await db.$transaction([
    db.materialStyleTag.deleteMany({ where: { materialId } }),
    ...(values.length ? [db.materialStyleTag.createMany({ data: values.map((value) => ({ materialId, value })) })] : []),
  ]);
}

/** Tạo mới (id = null) hoặc cập nhật chất liệu từ form nhiều phần (có file ảnh). */
export async function saveMaterial(id: string | null, form: FormData): Promise<SaveResult> {
  const parsed = fieldsSchema.safeParse({
    code: form.get("code"),
    name: form.get("name"),
    descHuman: form.get("descHuman") ?? "",
    sortOrder: form.get("sortOrder") || 0,
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const data = parsed.data;
  const thicknessMm = parseThickness(String(form.get("thicknessMm") ?? ""));
  if (thicknessMm === undefined) return fail("Độ dày phải là số, ví dụ 0.5 hoặc 0,8 (mm).");
  const swap = form.get("swapLayers") === "true"; // người dùng bấm "đổi chỗ" hai ảnh đã lưu
  const isActive = form.get("isActive") === "true";

  const existing = id ? await db.material.findUnique({ where: { id } }) : null;
  if (id && !existing) return fail("Không tìm thấy chất liệu.", 404);

  const sameCode = await db.material.findUnique({ where: { code: data.code } });
  if (sameCode && sameCode.id !== id) return fail("Mã chất liệu này đã tồn tại.", 409);

  // Phân loại: chỉ chọn từ danh mục. Form gửi đủ mọi trường (classifyForm=1, ô trống = xóa); client khác không gửi trường nào thì giữ nguyên.
  const fullForm = form.get("classifyForm") === "1";
  const text = (name: string): string | null | undefined => (form.has(name) ? String(form.get(name) ?? "") || null : undefined);
  const list = (name: string): string[] | undefined => (fullForm || form.has(name) ? form.getAll(name).map(String) : undefined);
  const patch: ClassifyPatch = {
    baseMaterial: text("baseMaterial"),
    technique: text("technique"),
    surfaceFinish: text("surfaceFinish"),
    surfacePattern: text("surfacePattern"),
    colorCount: text("colorCount"),
    frontColorName: text("frontColorName"),
    frontColorFamily: text("frontColorFamily"),
    frontColorConfidence: text("frontColorConfidence"),
    backColorName: text("backColorName"),
    backColorFamily: text("backColorFamily"),
    backColorConfidence: text("backColorConfidence"),
    seriesCode: text("seriesCode"),
    aiVisualNote: text("aiVisualNote"),
    classifyConfidence: text("classifyConfidence"),
    reviewNote: text("reviewNote"),
    needsReview: form.has("needsReview") ? form.get("needsReview") === "true" : undefined,
    styleTags: list("styleTags"),
    photoIssue: list("photoIssue"),
  };
  const currentTags = existing ? (await db.materialStyleTag.findMany({ where: { materialId: existing.id } })).map((t) => t.value) : [];
  const classified = normalizeClassification(patch, await loadOptions(), { ...(existing ?? {}), styleTags: currentTags });
  const basicErrors = requireBasics(classified.scalar, existing ?? {});
  const classifyErrors = [...classified.errors, ...basicErrors];
  if (classifyErrors.length) return fail(classifyErrors[0]);

  // Xử lý ảnh trước khi đụng CSDL: ảnh hỏng thì dừng sớm, không để lại dữ liệu dở dang.
  const processed: { layer1?: ProcessedImage; layer2?: ProcessedImage } = {};
  try {
    for (const [field, slot] of [
      ["layer1", "layer1"],
      ["layer2", "layer2"],
    ] as const) {
      const f = file(form, field);
      if (f) processed[slot] = await processMaterialImage(Buffer.from(await f.arrayBuffer()));
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Không xử lý được ảnh.");
  }

  const storage = getStorage();
  const material = existing
    ? await db.material.update({ where: { id: existing.id }, data: { ...data, thicknessMm, isActive, ...classified.scalar } })
    : await db.material.create({
        // groupName và printTech bắt buộc ở CSDL: requireBasics đã bảo đảm có baseMaterial/technique nên hai cột này luôn có nhãn
        data: { ...data, thicknessMm, isActive, ...classified.scalar, groupName: String(classified.scalar.groupName), printTech: String(classified.scalar.printTech) },
      });
  if (classified.styleTags) await replaceStyleTags(material.id, classified.styleTags);

  const written: string[] = []; // file mới ghi, để dọn nếu lỗi
  const toDelete: string[] = []; // file cũ bị thay thế, xóa sau khi lưu thành công
  try {
    const update: Record<string, unknown> = {};

    // Ảnh chất liệu nén WebP (chất lượng 82) rồi lưu; key có chuỗi ngẫu nhiên nên thay ảnh là key mới (không bị lưu đệm bản cũ)
    const store = async (img: ProcessedImage, role: MaterialImageRole) => {
      const key = materialKey(material.code, role);
      await storage.put(key, await toWebp(img.buffer), { contentType: "image/webp" });
      written.push(key);
      return key;
    };

    // Ảnh đã lưu nằm ở ô nào sau khi đổi chỗ (nếu có). Ảnh mới tải lên thì thay đúng ô đó.
    const oldL1 = existing?.layer1Path ?? null;
    const oldL2 = existing?.layer2Path ?? null;
    const keep1 = swap ? oldL2 : oldL1;
    const keep2 = swap ? oldL1 : oldL2;

    if (processed.layer1) {
      update.layer1Path = await store(processed.layer1, "layer1");
      if (keep1) toDelete.push(keep1);
    } else if (swap) {
      update.layer1Path = keep1;
    }
    if (processed.layer2) {
      update.layer2Path = await store(processed.layer2, "layer2");
      if (keep2) toDelete.push(keep2);
    } else if (swap) {
      update.layer2Path = keep2;
    }

    // Ghép lại ảnh tham chiếu khi lớp 1 hoặc lớp 2 thay đổi (kể cả chỉ đổi chỗ)
    if (processed.layer1 || processed.layer2 || swap) {
      const l1Key = "layer1Path" in update ? (update.layer1Path as string | null) : oldL1;
      const l2Key = "layer2Path" in update ? (update.layer2Path as string | null) : oldL2;
      if (l1Key && l2Key) {
        const buf1 = processed.layer1?.buffer ?? (await storage.get(l1Key));
        const buf2 = processed.layer2?.buffer ?? (await storage.get(l2Key));
        const ref = await composeReference(buf1, buf2);
        update.referencePath = await store(ref, "reference");
        update.referenceUpdatedAt = new Date();
        update.kieRefUrl = null; // ảnh đổi thì URL đã upload lên nhà cung cấp không còn đúng
        update.kieRefExpiresAt = null;
        if (existing?.referencePath) toDelete.push(existing.referencePath);
      }
    }

    if (Object.keys(update).length > 0) {
      await db.material.update({ where: { id: material.id }, data: update });
    }
  } catch (e) {
    await Promise.all(written.map((k) => storage.delete(k).catch(() => {})));
    if (!existing) await db.material.delete({ where: { id: material.id } }).catch(() => {});
    console.error("saveMaterial lỗi:", e);
    return fail("Không lưu được ảnh. Vui lòng thử lại.", 500);
  }

  await Promise.all(toDelete.map((k) => storage.delete(k).catch(() => {})));
  return { ok: true, id: material.id };
}
