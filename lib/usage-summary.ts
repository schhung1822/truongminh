import "server-only";
import type { SessionUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getQuotaInfo, todayKey } from "@/lib/jobs/limits";
import { getKieCredits } from "@/lib/providers";

export type UsageSummary =
  | {
      role: "ADMIN";
      provider: "mock" | "kie";
      /** tổng token (credits kie.ai) đã trừ cho các ảnh tạo qua web này */
      spentTotal: number;
      spentToday: number;
      imagesTotal: number;
      /** số dư kie.ai hiện tại; null nếu đang dùng ảnh giả hoặc không hỏi được */
      balance: number | null;
    }
  | {
      role: "SALE";
      provider: "mock" | "kie";
      quota: { limit: number; used: number; left: number } | null;
    };

const round = (n: number) => Math.round(n * 100) / 100;

/** Dữ liệu cho thanh đầu trang. Admin thấy token; sale chỉ thấy số lượt của mình (không lộ số dư tài khoản kie.ai). */
export async function getUsageSummary(user: SessionUser): Promise<UsageSummary> {
  const provider = getEnv().IMAGE_PROVIDER;
  if (user.role !== "ADMIN") {
    return { role: "SALE", provider, quota: await getQuotaInfo(user) };
  }

  // đầu ngày theo múi giờ cấu hình, dùng bảng usage_logs để biết ảnh nào tạo hôm nay
  const todayImageIds = (await db.usageLog.findMany({ where: { day: todayKey() }, select: { imageId: true } }))
    .map((u) => u.imageId)
    .filter((id): id is string => !!id);

  const [total, today, balance] = await Promise.all([
    db.generatedImage.aggregate({ _sum: { costCredits: true }, _count: { _all: true } }),
    todayImageIds.length
      ? db.generatedImage.aggregate({ _sum: { costCredits: true }, where: { id: { in: todayImageIds } } })
      : Promise.resolve({ _sum: { costCredits: 0 } }),
    provider === "kie" ? getKieCredits() : Promise.resolve(null),
  ]);

  return {
    role: "ADMIN",
    provider,
    spentTotal: round(total._sum.costCredits ?? 0),
    spentToday: round(today._sum.costCredits ?? 0),
    imagesTotal: total._count._all,
    balance: balance === null ? null : round(balance),
  };
}
