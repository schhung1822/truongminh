import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { loadWizardData } from "@/lib/wizard-data";
import { NewSessionWizard } from "./sessions/new/wizard";

export const metadata: Metadata = { title: "Trang chính" };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ logoId?: string }> }) {
  const user = await requireUser();
  const { logoId } = await searchParams;
  const wizard = await loadWizardData(user, logoId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Xin chào, {user.name}</h1>
        <p className="text-muted-foreground">Tạo phiên tư vấn mới ngay bên dưới. Muốn xem lại các phiên cũ, vào mục Lịch sử.</p>
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
          isAdmin={user.role === "ADMIN"}
        />
      </section>
    </div>
  );
}
