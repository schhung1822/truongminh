import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { loadQuotingData } from "../data";
import { MaterialsBoard } from "./materials-board";

export const metadata: Metadata = { title: "Tấm vật liệu" };

type Params = { q?: string; group?: string; tech?: string; miss?: string };

export default async function QuotingMaterialsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const data = await loadQuotingData();
  const initial = { q: params.q ?? "", group: params.group ?? "", tech: params.tech ?? "", miss: params.miss ?? "" };
  return <MaterialsBoard key={`${initial.q}|${initial.group}|${initial.tech}|${initial.miss}`} rows={data.rows} defaultGapMm={data.config.defaultGapMm} truncated={data.truncated} initial={initial} />;
}
