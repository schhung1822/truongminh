import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { getBusinessProfile } from "@/lib/knowledge";
import { isVisibility, PROFILE_FIELDS, type Visibility } from "@/lib/knowledge/roles";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Hồ sơ doanh nghiệp" };

export default async function BusinessProfilePage() {
  await requireAdmin();
  const p = await getBusinessProfile();
  const rawVisibility = p.visibility && typeof p.visibility === "object" ? (p.visibility as Record<string, unknown>) : {};

  const values: Record<string, string> = {};
  const visibility: Record<string, Visibility> = {};
  for (const f of PROFILE_FIELDS) {
    values[f.key] = p.fields[f.key] ?? "";
    const v = rawVisibility[f.key];
    visibility[f.key] = isVisibility(v) ? v : "INTERNAL";
  }
  const updated = p.updatedAt ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(p.updatedAt) : null;

  return <ProfileForm workshopName={p.workshopName} values={values} visibility={visibility} updated={updated} />;
}
