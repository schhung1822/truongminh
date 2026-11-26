import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { loadWizardData } from "@/lib/wizard-data";
import { NewSessionWizard } from "./sessions/new/wizard";

export const metadata: Metadata = { title: "Trang chính" };

/**
 * `?logoId=` mở thẳng tới logo đó ở bước chọn trang mẫu (link "tạo phiên mới" từ Lịch sử). Thêm `&browse=1` thì đứng lại ở
 * bước chọn logo, thấy các nút tạo ảnh và các phiên đã làm (dùng khi Quay lại từ một phiên).
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ logoId?: string; browse?: string }> }) {
  const user = await requireUser();
  const { logoId, browse } = await searchParams;
  const wizard = await loadWizardData(user, logoId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Xin chào, {user.name}</h1>
        <p className="text-muted-foreground">Mở thư mục khách hàng, chọn logo rồi tạo ảnh mẫu hoặc xem lại các phiên đã làm với logo đó.</p>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="new-session-title">
        <h2 id="new-session-title" className="text-lg font-semibold">
          Tạo phiên tư vấn mới
        </h2>
        <NewSessionWizard
          customers={wizard.customers}
          initial={wizard.initial}
          sheets={wizard.sheets}
          quota={wizard.quota}
          showCost={wizard.showCost}
          imageModel={wizard.imageModel}
          auto={wizard.auto}
          allMaterials={wizard.allMaterials}
          isAdmin={user.role === "ADMIN"}
          qualityDefault={wizard.qualityDefault}
          design={wizard.design}
          startAtBrowse={browse === "1"}
        />
      </section>
    </div>
  );
}
