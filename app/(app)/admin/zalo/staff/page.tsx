import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { fmtAgo } from "@/lib/fb/format";
import { roleLabel } from "@/lib/roles";
import { isZaloConfigured } from "@/lib/zalo";
import { getZaloSettings } from "@/lib/zalo/settings";
import { activeBotNames, loadBotUsers } from "@/lib/zalo/staff";
import { BotUsersBoard } from "../bot-users";
import { MasterOffNotice } from "../settings-kit";
import { StaffSettings } from "../staff-settings";
import { PairingBoard } from "../zalo-pairing";

export const metadata: Metadata = { title: "Zalo: nhân viên và quyền" };

export default async function ZaloStaffPage() {
  const admin = await requireAdmin();
  const [settings, configured, pairing, data, botNames] = await Promise.all([
    getZaloSettings(),
    isZaloConfigured(),
    db.zaloContact.findMany({ where: { role: "CUSTOMER", pairCode: { not: null } }, orderBy: { pairRequestedAt: "desc" } }),
    loadBotUsers(),
    activeBotNames(),
  ]);
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium" });

  return (
    <div className="flex flex-col gap-6">
      <MasterOffNotice enabled={settings.enabled} tokenSet={configured} />

      <Card>
        <CardHeader>
          <CardTitle>Ai được dùng bot Zalo</CardTitle>
          <CardDescription>
            Mỗi tài khoản web một dòng. Bot làm việc dưới tên tài khoản đó: ảnh tạo ra thuộc về người ấy và tính vào hạn mức ngày của họ. Tạo hay khóa tài khoản thì làm ở trang Người dùng.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BotUsersBoard
            pairingOn={settings.pairing}
            botNames={botNames}
            users={data.users.map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              roleLabel: roleLabel(u.role),
              isSelf: u.id === admin.id,
              access: u.access,
              code: u.code,
              zalo: u.zalo.map((z) => ({ contactId: z.contactId, zaloName: z.zaloName, botName: z.botName, botActive: z.botActive, lastCommand: z.lastCommandAt ? fmtAgo(z.lastCommandAt) : null })),
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ghép nối cần quản trị viên duyệt</CardTitle>
          <CardDescription>Cách cũ, dành cho người chưa có mã: họ nhắn /ghepnoi cho bot, bot trả mã 4 số, bạn hỏi mã đó rồi nhập vào đây và chọn tài khoản web của họ.</CardDescription>
        </CardHeader>
        <CardContent>
          <PairingBoard
            enabled={settings.pairing}
            pending={pairing.map((p) => ({ id: p.id, name: p.displayName, requestedAt: p.pairRequestedAt ? fmt.format(p.pairRequestedAt) : null }))}
            staff={data.unlinked.map((s) => ({ id: s.contactId, name: s.zaloName, note: s.botName }))}
            users={data.users.map((u) => ({ id: u.id, name: u.name }))}
          />
        </CardContent>
      </Card>

      <StaffSettings initial={settings} />
    </div>
  );
}
