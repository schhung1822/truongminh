import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { addDays } from "@/lib/stats/range";
import { todayKey } from "@/lib/jobs/limits";
import { getZaloSettings } from "@/lib/zalo/settings";
import { zonedStartOfDay } from "@/lib/time";
import { CareBoard, type AssetVM, type GroupVM } from "./care-board";

export const metadata: Metadata = { title: "Kịch bản chăm sóc" };

const fileUrl = (p: string | null | undefined) => (p ? `/api/files/${p.split("/").map(encodeURIComponent).join("/")}` : null);

export default async function CarePage() {
  const user = await requireUser();
  const s = await getZaloSettings();

  if (!s.enabled || !s.care) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Kịch bản chăm sóc</h1>
        <p className="text-muted-foreground">
          Kịch bản chăm sóc đang tắt.{" "}
          {user.role === "ADMIN" ? (
            <>
              Bật ở <Link href="/admin/zalo" className="underline">Quản trị &gt; Zalo</Link>.
            </>
          ) : (
            "Báo quản trị viên nếu cần dùng."
          )}
        </p>
      </div>
    );
  }

  const tz = getEnv().APP_TIMEZONE;
  const since = zonedStartOfDay(addDays(todayKey(), -2), tz)!;
  const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
  const sentFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: tz, dateStyle: "short", timeStyle: "short" });

  const [groups, assets] = await Promise.all([
    db.zaloGroup.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        posts: {
          where: { scheduledAt: { gte: since } },
          orderBy: { scheduledAt: "asc" },
          include: { asset: true, image: { select: { id: true, finalPath: true } } },
        },
      },
    }),
    db.zaloAsset.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
  ]);

  const groupVMs: GroupVM[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    insight: g.insight ?? "",
    careEnabled: g.careEnabled,
    postsPerDay: g.postsPerDay,
    posts: g.posts.map((p) => ({
      id: p.id,
      date: dateFmt.format(p.scheduledAt),
      time: timeFmt.format(p.scheduledAt),
      kind: p.kind,
      text: p.text,
      status: p.status,
      reason: p.reason,
      error: p.error,
      aiGenerated: p.aiGenerated,
      edited: !!p.editedAt,
      sentAt: p.sentAt ? sentFmt.format(p.sentAt) : null,
      media: p.asset
        ? { value: `asset:${p.asset.id}`, kind: p.asset.kind === "VIDEO" ? "VIDEO" : "IMAGE", label: p.asset.title, url: p.asset.kind === "IMAGE" ? fileUrl(p.asset.path) : null }
        : p.image
          ? { value: `image:${p.image.id}`, kind: "IMAGE", label: "Ảnh mẫu đã tạo", url: fileUrl(p.image.finalPath) }
          : null,
    })),
  }));

  const assetVMs: AssetVM[] = assets.map((a) => ({
    id: a.id,
    kind: a.kind === "VIDEO" ? "VIDEO" : "IMAGE",
    title: a.title,
    description: a.description,
    url: a.kind === "IMAGE" ? fileUrl(a.path) : null,
    sizeMb: Math.round((a.sizeBytes / 1024 / 1024) * 10) / 10,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Kịch bản chăm sóc nhóm Zalo</h1>
        <p className="text-muted-foreground">
          AI lên kịch bản 2-3 lượt đăng mỗi ngày cho từng nhóm theo insight nhóm, thời tiết và dịp lễ. Bạn chỉnh nội dung rồi bấm đăng. Chạy trên máy cá nhân nên chưa tự đăng đúng giờ, hãy bấm &quot;Đăng các bài đến giờ&quot; hoặc &quot;Đăng ngay&quot;.
        </p>
      </div>
      <CareBoard groups={groupVMs} assets={assetVMs} autoRun={s.careAutoRun} timeZone={tz} />
    </div>
  );
}
