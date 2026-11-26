import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { isZaloConfigured } from "@/lib/zalo";
import { getZaloSettings } from "@/lib/zalo/settings";
import { StaffSettings } from "../staff-settings";
import { PairingBoard } from "../zalo-pairing";

export const metadata: Metadata = { title: "Zalo: nhân viên và lệnh" };

export default async function ZaloStaffPage() {
  await requireAdmin();
  const [settings, configured, pairing, staff, users] = await Promise.all([
    getZaloSettings(),
    isZaloConfigured(),
    db.zaloContact.findMany({ where: { role: "CUSTOMER", pairCode: { not: null } }, orderBy: { pairRequestedAt: "desc" } }),
    db.zaloContact.findMany({ where: { role: "STAFF" }, orderBy: { displayName: "asc" } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium" });

  return (
    <div className="flex flex-col gap-6">
      <StaffSettings initial={settings} tokenSet={configured} />

      <Card>
        <CardHeader>
          <CardTitle>Ghép nối nhân viên</CardTitle>
          <CardDescription>Cho phép tài khoản Zalo của nhân viên dùng lệnh gõ nhanh và tag bot ra lệnh.</CardDescription>
        </CardHeader>
        <CardContent>
          <PairingBoard
            enabled={settings.pairing}
            pending={pairing.map((p) => ({ id: p.id, name: p.displayName, requestedAt: p.pairRequestedAt ? fmt.format(p.pairRequestedAt) : null }))}
            staff={staff.map((s) => ({ id: s.id, name: s.displayName, userId: s.userId }))}
            users={users}
          />
        </CardContent>
      </Card>
    </div>
  );
}
