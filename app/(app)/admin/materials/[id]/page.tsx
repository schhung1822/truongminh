import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MaterialForm } from "@/components/materials/material-form";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { loadOptions } from "@/lib/materials/options";
import { fileUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Sửa chất liệu" };

export default async function EditMaterialPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [m, options] = await Promise.all([
    db.material.findUnique({ where: { id }, include: { styleTags: { select: { value: true } } } }),
    loadOptions(),
  ]);
  if (!m) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        Sửa chất liệu: {m.code} - {m.name}
      </h1>
      <MaterialForm
        options={options}
        initial={{
          id: m.id,
          code: m.code,
          name: m.name,
          descHuman: m.descHuman,
          thicknessMm: m.thicknessMm,
          sortOrder: m.sortOrder,
          isActive: m.isActive,
          layer1Url: fileUrl(m.layer1Path),
          layer2Url: fileUrl(m.layer2Path),
          referenceUrl: fileUrl(m.referencePath),
          baseMaterial: m.baseMaterial,
          technique: m.technique,
          surfaceFinish: m.surfaceFinish,
          surfacePattern: m.surfacePattern,
          colorCount: m.colorCount,
          frontColorName: m.frontColorName,
          frontColorFamily: m.frontColorFamily,
          frontColorConfidence: m.frontColorConfidence,
          backColorName: m.backColorName,
          backColorFamily: m.backColorFamily,
          backColorConfidence: m.backColorConfidence,
          seriesCode: m.seriesCode,
          aiVisualNote: m.aiVisualNote,
          photoIssue: m.photoIssue,
          classifyConfidence: m.classifyConfidence,
          needsReview: m.needsReview,
          reviewNote: m.reviewNote,
          styleTags: m.styleTags.map((t) => t.value),
        }}
      />
    </div>
  );
}
