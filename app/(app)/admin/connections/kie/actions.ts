"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/dal";
import { USD_PER_CREDIT } from "@/lib/pricing";
import { getProvider } from "@/lib/providers";
import { KieProvider } from "@/lib/providers/kie";

export type KieCheckResult = { error?: string; ok?: string };

/** Hỏi thẳng kie.ai số dư (không tốn token) để biết khóa API còn dùng được. Không dùng số đã nhớ tạm. */
export async function checkKieAction(): Promise<KieCheckResult> {
  await requireAdmin();
  const provider = getProvider();
  if (!(provider instanceof KieProvider)) {
    return { error: 'Hệ thống đang chạy chế độ ảnh giả (IMAGE_PROVIDER="mock") nên không gọi kie.ai.' };
  }
  try {
    const credits = await provider.getCredits();
    revalidatePath("/admin/connections", "layout");
    return { ok: `Kết nối được. Số dư ${credits.toLocaleString("vi-VN")} token (khoảng $${(credits * USD_PER_CREDIT).toFixed(2)}).` };
  } catch (e) {
    return { error: (e instanceof Error ? e.message : "Không gọi được kie.ai.").slice(0, 300) };
  }
}
