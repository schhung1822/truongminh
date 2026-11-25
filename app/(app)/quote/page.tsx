import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { loadCustomerOptions, loadLogoContext } from "@/lib/wizard-data";
import { loadActiveMaterials } from "./data";
import { QuoteTool } from "./quote-tool";

export const metadata: Metadata = { title: "Báo giá sản xuất" };

export default async function QuotePage({
  searchParams,
}: {
  searchParams: Promise<{ logoId?: string; sessionId?: string; materialId?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const [customers, materials] = await Promise.all([loadCustomerOptions(user), loadActiveMaterials()]);

  // phiên (nếu có) phải tồn tại; không có logoId thì lấy logo của phiên
  const session = sp.sessionId
    ? await db.consultSession.findUnique({ where: { id: sp.sessionId }, select: { id: true, logoId: true } })
    : null;
  const logoId = sp.logoId || session?.logoId || "";
  const sessionId = session && (!sp.logoId || sp.logoId === session.logoId) ? session.id : null;

  const initial = logoId ? await loadLogoContext(user, logoId, customers) : null;
  const initialMaterialId = sp.materialId && materials.some((m) => m.id === sp.materialId) ? sp.materialId : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Báo giá sản xuất</h1>
        <p className="text-muted-foreground">
          Chọn logo và chất liệu, nhập kích thước logo (cm): hệ thống xếp logo lên tấm, cho biết mỗi tấm được bao nhiêu logo và giá theo từng mốc số lượng.
        </p>
      </div>
      <QuoteTool
        customers={customers}
        materials={materials}
        initial={initial}
        initialMaterialId={initialMaterialId}
        sessionId={sessionId}
      />
    </div>
  );
}
