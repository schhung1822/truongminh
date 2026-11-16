import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MaterialForm } from "@/components/materials/material-form";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { fileUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Sửa chất liệu" };

export default async function EditMaterialPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const m = await db.material.findUnique({ where: { id } });
  if (!m) notFound();

  const [groups, techs] = await Promise.all([
    db.material.findMany({ distinct: ["groupName"], select: { groupName: true } }),
    db.material.findMany({ distinct: ["printTech"], select: { printTech: true } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        Sửa chất liệu: {m.code} - {m.name}
      </h1>
      <MaterialForm
        groups={groups.map((g) => g.groupName)}
        techs={techs.map((t) => t.printTech)}
        initial={{
          id: m.id,
          code: m.code,
          name: m.name,
          groupName: m.groupName,
          printTech: m.printTech,
          descHuman: m.descHuman,
          descAi: m.descAi,
          sortOrder: m.sortOrder,
          isActive: m.isActive,
          layer1Url: fileUrl(m.layer1Path),
          layer2Url: fileUrl(m.layer2Path),
          productPhotoUrl: fileUrl(m.productPhotoPath),
          referenceUrl: fileUrl(m.referencePath),
        }}
      />
    </div>
  );
}
