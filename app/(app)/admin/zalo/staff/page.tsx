import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getZaloSettings } from "@/lib/zalo/settings";
import { StaffSettings, WaitingBoard } from "../staff-settings";
import { PairingBoard } from "../zalo-pairing";

export const metadata: Metadata = { title: "Zalo: nhân viên và lệnh" };

export default async function ZaloStaffPage() {
  await requireAdmin();
  const env = getEnv();
  const [settings, pairing, staff, waiting] = await Promise.all([
    getZaloSettings(),
    db.zaloContact.findMany({ where: { role: "CUSTOMER", pairCode: { not: null } }, orderBy: { pairRequestedAt: "desc" } }),
    db.zaloContact.findMany({ where: { role: "STAFF" }, orderBy: { displayName: "asc" } }),
    db.zaloContact.findMany({ where: { role: "CUSTOMER", needsHuman: true }, orderBy: { lastMessageAt: "desc" }, take: 50 }),
  ]);
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium" });

  return (
    <div className="flex flex-col gap-6">
      <StaffSettings initial={settings} tokenSet={!!env.ZALO_BOT_TOKEN} />

      <Card>
        <CardHeader>
          <CardTitle>Ghép nối nhân viên</CardTitle>
          <CardDescription>Cho phép tài khoản Zalo của nhân viên dùng lệnh gõ nhanh và nhận thông báo khi có khách cần người.</CardDescription>
        </CardHeader>
        <CardContent>
          <PairingBoard
            enabled={settings.pairing}
            pending={pairing.map((p) => ({ id: p.id, name: p.displayName, requestedAt: p.pairRequestedAt ? fmt.format(p.pairRequestedAt) : null }))}
            staff={staff.map((s) => ({ id: s.id, name: s.displayName }))}
          />
        </CardContent>
      </Card>

      <WaitingBoard
        rows={waiting.map((c) => ({
          id: c.id,
          name: c.displayName,
          isGroup: c.chatType === "GROUP",
          lastText: c.lastMessageText,
          at: c.lastMessageAt ? fmt.format(c.lastMessageAt) : null,
        }))}
      />
    </div>
  );
}
