import type { Metadata } from "next";
import { MaterialForm } from "@/components/materials/material-form";
import { requireAdmin } from "@/lib/auth/dal";
import { loadOptions } from "@/lib/materials/options";

export const metadata: Metadata = { title: "Thêm chất liệu" };

export default async function NewMaterialPage() {
  await requireAdmin();
  const options = await loadOptions();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Thêm chất liệu</h1>
      <MaterialForm options={options} />
    </div>
  );
}
