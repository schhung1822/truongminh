import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { loadQuotingData } from "../data";
import { MachineCard } from "./machine-card";

export const metadata: Metadata = { title: "Thông số máy" };

export default async function QuotingMachinesPage() {
  await requireAdmin();
  const { techniques } = await loadQuotingData();
  const needing = techniques.filter((t) => t.activeMaterials > 0 && t.state !== "ok");

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Mỗi công nghệ một thẻ. Danh sách gồm các công nghệ đang bật trong danh mục chất liệu và những công nghệ mà chất liệu đang bật có dùng. Ô trống là &quot;chưa có dữ liệu&quot;: thiếu ô bắt buộc thì chất liệu dùng công nghệ đó chưa báo giá được.
      </p>
      {needing.length > 0 && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          Công nghệ đang dùng mà còn thiếu thông số máy: <b>{needing.map((t) => t.label).join(", ")}</b>.
        </p>
      )}
      {techniques.length === 0 ? (
        <div className="rounded-xl border border-dashed py-14 text-center text-muted-foreground">Chưa có công nghệ nào. Thêm công nghệ ở Chất liệu &gt; Danh mục, rồi gán cho chất liệu.</div>
      ) : (
        techniques.map((t) => <MachineCard key={t.value} tech={t} />)
      )}
    </div>
  );
}
