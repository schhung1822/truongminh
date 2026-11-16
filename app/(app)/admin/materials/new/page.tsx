import type { Metadata } from "next";
import { MaterialForm } from "@/components/materials/material-form";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Thêm chất liệu" };

export default async function NewMaterialPage() {
  await requireAdmin();
  const [groups, techs] = await Promise.all([
    db.material.findMany({ distinct: ["groupName"], select: { groupName: true } }),
    db.material.findMany({ distinct: ["printTech"], select: { printTech: true } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Thêm chất liệu</h1>
      <MaterialForm groups={groups.map((g) => g.groupName)} techs={techs.map((t) => t.printTech)} />
    </div>
  );
}
