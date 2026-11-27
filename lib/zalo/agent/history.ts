import "server-only";
import { db } from "@/lib/db";
import type { MaterialSignal } from "./plan";

/**
 * Lịch sử của một khách hàng mà trợ lý Zalo dùng để biết "khách từng ưng mẫu nào" (D129): các logo, các phiên ảnh gần đây,
 * chất liệu khách đã chọn làm thiết kế hoặc đã nhận/chốt báo giá, và các mẫu Pinterest đã bấm thích.
 * Không trả về giá tiền hay nội dung báo giá: trợ lý có thể đang nói trong nhóm có khách.
 */

export type CustomerHistory = {
  customer: { id: string; name: string };
  logos: { id: string; brandName: string; note: string | null; createdAt: Date }[];
  sessions: { id: string; type: "CATALOG" | "DESIGN"; logoId: string; createdAt: Date; productType: string | null; images: number; materialCodes: string[] }[];
  signals: MaterialSignal[];
  /** mẫu Pinterest đã thích, của logo đang làm trước rồi tới các logo khác, mới nhất trước */
  favoritePins: { id: string; title: string; boardName: string; logoId: string }[];
  /** loại sản phẩm của lượt thiết kế gần nhất, ưu tiên đúng logo đang làm (để khỏi hỏi lại) */
  lastProductType: string | null;
};

export async function loadCustomerHistory(customerId: string, focusLogoId?: string | null): Promise<CustomerHistory | null> {
  const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true } });
  if (!customer) return null;
  const logos = await db.logo.findMany({
    where: { brand: { customerId } },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { id: true, note: true, createdAt: true, brand: { select: { name: true } } },
  });
  const logoIds = logos.map((l) => l.id);
  if (logoIds.length === 0) return { customer, logos: [], sessions: [], signals: [], favoritePins: [], lastProductType: null };

  const material = { select: { id: true, code: true, name: true, isActive: true, referencePath: true } } as const;
  const [sessions, selected, quotes, favorites] = await Promise.all([
    db.consultSession.findMany({
      where: { logoId: { in: logoIds } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        type: true,
        logoId: true,
        createdAt: true,
        productType: true,
        selectedMaterials: { select: { material: { select: { code: true } } }, take: 12 },
        _count: { select: { images: { where: { status: "SUCCESS", retries: { none: {} } } } } },
      },
    }),
    db.sessionSelectedMaterial.findMany({
      where: { session: { logoId: { in: logoIds }, type: "DESIGN" } },
      take: 600,
      select: { material, session: { select: { logoId: true, createdAt: true } } },
    }),
    db.quote.findMany({ where: { logoId: { in: logoIds }, status: { in: ["SENT", "WON"] } }, take: 200, select: { status: true, logoId: true, createdAt: true, material } }),
    db.logoFavoritePin.findMany({
      where: { logoId: { in: logoIds } },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { logoId: true, pin: { select: { id: true, title: true, altText: true, board: { select: { name: true } } } } },
    }),
  ]);

  // Loại sản phẩm để khỏi hỏi lại: lượt thiết kế gần nhất của ĐÚNG logo đang làm, chưa có thì của logo khác cùng khách
  // (khách làm móc khóa cho thương hiệu này không có nghĩa là thương hiệu kia cũng làm móc khóa).
  const designWithProduct = (logoFilter: string | { in: string[] }) =>
    db.consultSession.findFirst({ where: { logoId: logoFilter, type: "DESIGN", productType: { not: null } }, orderBy: { createdAt: "desc" }, select: { productType: true } });
  const lastDesign = (focusLogoId ? await designWithProduct(focusLogoId) : null) ?? (await designWithProduct({ in: logoIds }));

  const usable = (m: { isActive: boolean; referencePath: string | null }) => m.isActive && !!m.referencePath;
  const signals: MaterialSignal[] = [
    ...selected.map((s) => ({ materialId: s.material.id, code: s.material.code, name: s.material.name, usable: usable(s.material), source: "design" as const, sameLogo: s.session.logoId === focusLogoId, at: s.session.createdAt.getTime() })),
    ...quotes.map((q) => ({ materialId: q.material.id, code: q.material.code, name: q.material.name, usable: usable(q.material), source: q.status === "WON" ? ("quote_won" as const) : ("quote_sent" as const), sameLogo: q.logoId === focusLogoId, at: q.createdAt.getTime() })),
  ];

  const seenPins = new Set<string>();
  const favoritePins = [...favorites.filter((f) => f.logoId === focusLogoId), ...favorites.filter((f) => f.logoId !== focusLogoId)]
    .filter((f) => (seenPins.has(f.pin.id) ? false : (seenPins.add(f.pin.id), true)))
    .map((f) => ({ id: f.pin.id, title: f.pin.title || f.pin.altText || "Mẫu Pinterest", boardName: f.pin.board.name, logoId: f.logoId }));

  return {
    customer,
    logos: logos.map((l) => ({ id: l.id, brandName: l.brand.name, note: l.note, createdAt: l.createdAt })),
    sessions: sessions.map((s) => ({
      id: s.id,
      type: s.type,
      logoId: s.logoId,
      createdAt: s.createdAt,
      productType: s.productType,
      images: s._count.images,
      materialCodes: s.selectedMaterials.map((m) => m.material.code),
    })),
    signals,
    favoritePins,
    lastProductType: lastDesign?.productType ?? null,
  };
}
