"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getStorage } from "@/lib/storage";
import { generateCarePlan, loadMediaOptions, publishPost, runDuePosts, type DueSummary } from "@/lib/zalo/care";
import { zonedDateTime } from "@/lib/zalo/care-plan";
import { getZaloSettings } from "@/lib/zalo/settings";

type Result = { error?: string; ok?: string };

async function requireCare() {
  const user = await requireUser();
  const s = await getZaloSettings();
  if (!s.enabled || !s.care) throw new Error("Kịch bản chăm sóc đang tắt.");
  return { user, settings: s };
}

function fail(e: unknown): Result {
  return { error: e instanceof Error ? e.message : "Có lỗi không xác định." };
}

const revalidate = () => revalidatePath("/zalo/care");

/** Lưu mô tả (insight) và cài đặt chăm sóc của một nhóm. */
export async function saveGroupCareAction(groupId: string, input: { insight: string; careEnabled: boolean; postsPerDay: number }): Promise<Result> {
  try {
    await requireCare();
    const p = z.object({ insight: z.string().trim().max(3000), careEnabled: z.boolean(), postsPerDay: z.number().int().min(2).max(3) }).safeParse(input);
    if (!p.success) return { error: p.error.issues[0].message };
    await db.zaloGroup.update({ where: { id: groupId }, data: { insight: p.data.insight || null, careEnabled: p.data.careEnabled, postsPerDay: p.data.postsPerDay } });
    revalidate();
    return { ok: "Đã lưu nhóm." };
  } catch (e) {
    return fail(e);
  }
}

/** Nhờ AI lên kịch bản cho một nhóm. */
export async function generatePlanAction(groupId: string, includeToday: boolean): Promise<Result> {
  try {
    await requireCare();
    const r = await generateCarePlan(groupId, { includeToday });
    if (!r.ok) return { error: r.error };
    revalidate();
    return { ok: `Đã lên ${r.created} bài${r.kept > 0 ? `, giữ nguyên ${r.kept} bài bạn đã chỉnh hoặc đã đăng` : ""}.` };
  } catch (e) {
    return fail(e);
  }
}

/** Lên kịch bản cho mọi nhóm đang bật chăm sóc. */
export async function generateAllPlansAction(includeToday: boolean): Promise<Result> {
  try {
    await requireCare();
    const groups = await db.zaloGroup.findMany({ where: { isActive: true, careEnabled: true }, orderBy: { name: "asc" } });
    if (groups.length === 0) return { error: "Chưa có nhóm nào bật chăm sóc. Bật \"Chăm sóc\" ở nhóm trước." };
    let created = 0;
    const errors: string[] = [];
    for (const g of groups) {
      const r = await generateCarePlan(g.id, { includeToday });
      if (r.ok) created += r.created;
      else errors.push(`${g.name}: ${r.error}`);
    }
    revalidate();
    if (errors.length > 0 && created === 0) return { error: errors.join(" | ") };
    return { ok: `Đã lên ${created} bài cho ${groups.length - errors.length} nhóm.${errors.length ? ` Lỗi: ${errors.join(" | ")}` : ""}` };
  } catch (e) {
    return fail(e);
  }
}

const editSchema = z.object({
  text: z.string().trim().min(1, "Nội dung không được để trống.").max(4000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Giờ không hợp lệ."),
  /** "asset:<id>" | "image:<id>" | null (chỉ chữ) */
  media: z.string().nullable(),
});

/** Sửa nội dung, giờ và tư liệu của một bài chưa đăng. */
export async function updatePostAction(postId: string, input: z.input<typeof editSchema>): Promise<Result> {
  try {
    const { user } = await requireCare();
    const p = editSchema.safeParse(input);
    if (!p.success) return { error: p.error.issues[0].message };
    const at = zonedDateTime(p.data.date, p.data.time, getEnv().APP_TIMEZONE);
    if (!at) return { error: "Ngày giờ không hợp lệ." };

    let assetId: string | null = null;
    let imageId: string | null = null;
    let kind: "TEXT" | "IMAGE" | "VIDEO" = "TEXT";
    if (p.data.media) {
      const [type, id] = p.data.media.split(":");
      if (type === "asset") {
        const a = await db.zaloAsset.findUnique({ where: { id } });
        if (!a) return { error: "Không tìm thấy tư liệu đã chọn." };
        assetId = a.id;
        kind = a.kind;
      } else if (type === "image") {
        const img = await db.generatedImage.findUnique({ where: { id }, select: { id: true, status: true } });
        if (!img || img.status !== "SUCCESS") return { error: "Không tìm thấy ảnh đã chọn." };
        imageId = img.id;
        kind = "IMAGE";
      } else return { error: "Tư liệu không hợp lệ." };
    }

    const res = await db.zaloPost.updateMany({
      where: { id: postId, status: { in: ["PLANNED", "FAILED"] } },
      data: { text: p.data.text, scheduledAt: at, kind, assetId, imageId, status: "PLANNED", error: null, editedAt: new Date(), editedByUserId: user.id },
    });
    if (res.count === 0) return { error: "Bài này đã đăng hoặc đang đăng nên không sửa được." };
    revalidate();
    return { ok: "Đã lưu bài." };
  } catch (e) {
    return fail(e);
  }
}

/** Thêm một bài viết tay vào nhóm (giờ mặc định: 1 tiếng nữa). */
export async function addPostAction(groupId: string): Promise<Result> {
  try {
    const { user } = await requireCare();
    await db.zaloPost.create({
      data: { groupId, scheduledAt: new Date(Date.now() + 3600_000), kind: "TEXT", text: "Nội dung bài đăng...", aiGenerated: false, editedAt: new Date(), editedByUserId: user.id },
    });
    revalidate();
    return { ok: "Đã thêm bài mới, hãy sửa nội dung và giờ." };
  } catch (e) {
    return fail(e);
  }
}

/** Đăng một bài vào nhóm ngay bây giờ. */
export async function publishPostAction(postId: string): Promise<Result> {
  try {
    await requireCare();
    const r = await publishPost(postId);
    revalidate();
    return r.ok ? { ok: "Đã đăng vào nhóm Zalo." } : { error: r.error };
  } catch (e) {
    return fail(e);
  }
}

/** Đăng mọi bài đã tới giờ. */
export async function runDueAction(): Promise<Result & { summary?: DueSummary }> {
  try {
    await requireCare();
    const sum = await runDuePosts();
    revalidate();
    if (sum.total === 0) return { ok: "Chưa có bài nào tới giờ." };
    return sum.failed > 0
      ? { error: `Đăng ${sum.sent}/${sum.total} bài. Lỗi: ${sum.errors.join(" | ")}`, summary: sum }
      : { ok: `Đã đăng ${sum.sent} bài.`, summary: sum };
  } catch (e) {
    return fail(e);
  }
}

export async function skipPostAction(postId: string, skip: boolean): Promise<Result> {
  try {
    await requireCare();
    const res = await db.zaloPost.updateMany({
      where: skip ? { id: postId, status: { in: ["PLANNED", "FAILED"] } } : { id: postId, status: "SKIPPED" },
      data: { status: skip ? "SKIPPED" : "PLANNED" },
    });
    if (res.count === 0) return { error: "Không đổi được trạng thái bài này." };
    revalidate();
    return { ok: skip ? "Đã bỏ qua bài này." : "Đã khôi phục bài." };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePostAction(postId: string): Promise<Result> {
  try {
    await requireCare();
    const res = await db.zaloPost.deleteMany({ where: { id: postId, status: { in: ["PLANNED", "FAILED", "SKIPPED"] } } });
    if (res.count === 0) return { error: "Bài đã đăng hoặc đang đăng nên không xóa được." };
    revalidate();
    return { ok: "Đã xóa bài." };
  } catch (e) {
    return fail(e);
  }
}

export type MediaPick = { value: string; kind: "IMAGE" | "VIDEO"; label: string; url: string | null };

/** Danh sách tư liệu để chọn đính kèm cho bài (thư viện + ảnh đã tạo gần đây). */
export async function listMediaPicksAction(): Promise<{ picks: MediaPick[]; error?: string }> {
  try {
    await requireCare();
    const options = await loadMediaOptions();
    const assets = await db.zaloAsset.findMany({ where: { id: { in: options.map((o) => o.assetId).filter((x): x is string => !!x) } } });
    const images = await db.generatedImage.findMany({ where: { id: { in: options.map((o) => o.imageId).filter((x): x is string => !!x) } }, select: { id: true, finalPath: true } });
    const assetMap = new Map(assets.map((a) => [a.id, a]));
    const imageMap = new Map(images.map((i) => [i.id, i]));
    const url = (p: string | null | undefined) => (p ? `/api/files/${p.split("/").map(encodeURIComponent).join("/")}` : null);
    return {
      picks: options.map((o) =>
        o.assetId
          ? { value: `asset:${o.assetId}`, kind: o.kind, label: o.label, url: o.kind === "IMAGE" ? url(assetMap.get(o.assetId)?.path) : null }
          : { value: `image:${o.imageId}`, kind: o.kind, label: o.label, url: url(imageMap.get(o.imageId!)?.finalPath) },
      ),
    };
  } catch (e) {
    return { picks: [], ...fail(e) };
  }
}

/** Xóa tư liệu khỏi thư viện (các bài đang dùng nó sẽ thiếu đính kèm và cần chọn lại). */
export async function deleteAssetAction(assetId: string): Promise<Result> {
  try {
    const { user } = await requireCare();
    const a = await db.zaloAsset.findUnique({ where: { id: assetId } });
    if (!a) return {};
    if (user.role !== "ADMIN" && a.createdById !== user.id) return { error: "Chỉ người tải lên hoặc quản trị viên mới xóa được." };
    await db.zaloAsset.delete({ where: { id: assetId } });
    await getStorage().delete(a.path).catch(() => {});
    revalidate();
    return { ok: "Đã xóa khỏi thư viện." };
  } catch (e) {
    return fail(e);
  }
}
