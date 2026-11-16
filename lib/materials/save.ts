import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { composeReference, processMaterialImage, type ProcessedImage } from "@/lib/imaging/material-images";
import { getStorage } from "@/lib/storage";

export type SaveResult = { ok: true; id: string } | { ok: false; error: string; status: number };

const fieldsSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập mã chất liệu.")
    .max(50, "Mã tối đa 50 ký tự.")
    .regex(/^[^/\\]+$/, "Mã không được chứa dấu / hoặc \\."),
  name: z.string().trim().min(1, "Vui lòng nhập tên gọi.").max(100, "Tên tối đa 100 ký tự."),
  groupName: z.string().trim().min(1, "Vui lòng nhập nhóm chất liệu.").max(100),
  printTech: z.string().trim().min(1, "Vui lòng nhập công nghệ in.").max(100),
  descHuman: z.string().trim().max(2000, "Mô tả tối đa 2000 ký tự.").default(""),
  descAi: z.string().trim().max(2000, "Mô tả cho AI tối đa 2000 ký tự.").default(""),
  sortOrder: z.coerce.number().int("Thứ tự phải là số nguyên.").min(0).max(100000).default(0),
});

function file(form: FormData, name: string): File | null {
  const v = form.get(name);
  return v instanceof File && v.size > 0 ? v : null;
}

const fail = (error: string, status = 400): SaveResult => ({ ok: false, error, status });

/** Tạo mới (id = null) hoặc cập nhật chất liệu từ form nhiều phần (có file ảnh). */
export async function saveMaterial(id: string | null, form: FormData): Promise<SaveResult> {
  const parsed = fieldsSchema.safeParse({
    code: form.get("code"),
    name: form.get("name"),
    groupName: form.get("groupName"),
    printTech: form.get("printTech"),
    descHuman: form.get("descHuman") ?? "",
    descAi: form.get("descAi") ?? "",
    sortOrder: form.get("sortOrder") || 0,
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const data = parsed.data;
  const isActive = form.get("isActive") === "true";

  const existing = id ? await db.material.findUnique({ where: { id } }) : null;
  if (id && !existing) return fail("Không tìm thấy chất liệu.", 404);

  const sameCode = await db.material.findUnique({ where: { code: data.code } });
  if (sameCode && sameCode.id !== id) return fail("Mã chất liệu này đã tồn tại.", 409);

  // Xử lý ảnh trước khi đụng CSDL: ảnh hỏng thì dừng sớm, không để lại dữ liệu dở dang.
  const processed: { layer1?: ProcessedImage; layer2?: ProcessedImage; product?: ProcessedImage } = {};
  try {
    for (const [field, slot] of [
      ["layer1", "layer1"],
      ["layer2", "layer2"],
      ["productPhoto", "product"],
    ] as const) {
      const f = file(form, field);
      if (f) processed[slot] = await processMaterialImage(Buffer.from(await f.arrayBuffer()));
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Không xử lý được ảnh.");
  }

  const storage = getStorage();
  const material = existing
    ? await db.material.update({ where: { id: existing.id }, data: { ...data, isActive } })
    : await db.material.create({ data: { ...data, isActive } });

  const written: string[] = []; // file mới ghi, để dọn nếu lỗi
  const toDelete: string[] = []; // file cũ bị thay thế, xóa sau khi lưu thành công
  try {
    const stamp = Date.now();
    const update: Record<string, unknown> = {};

    const store = async (img: ProcessedImage, name: string) => {
      const key = `materials/${material.id}/${name}-${stamp}.${img.ext}`;
      await storage.put(key, img.buffer);
      written.push(key);
      return key;
    };

    if (processed.layer1) {
      update.layer1Path = await store(processed.layer1, "layer1");
      if (existing?.layer1Path) toDelete.push(existing.layer1Path);
    }
    if (processed.layer2) {
      update.layer2Path = await store(processed.layer2, "layer2");
      if (existing?.layer2Path) toDelete.push(existing.layer2Path);
    }
    if (processed.product) {
      update.productPhotoPath = await store(processed.product, "product");
      if (existing?.productPhotoPath) toDelete.push(existing.productPhotoPath);
    } else if (form.get("removeProductPhoto") === "true" && existing?.productPhotoPath) {
      update.productPhotoPath = null;
      toDelete.push(existing.productPhotoPath);
    }

    // Ghép lại ảnh tham chiếu khi lớp 1 hoặc lớp 2 thay đổi
    if (processed.layer1 || processed.layer2) {
      const l1Key = (update.layer1Path as string | undefined) ?? existing?.layer1Path;
      const l2Key = (update.layer2Path as string | undefined) ?? existing?.layer2Path;
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
