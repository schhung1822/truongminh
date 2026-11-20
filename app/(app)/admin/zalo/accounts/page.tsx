import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { AccountsBoard, type AccountRow } from "./accounts-board";

export const metadata: Metadata = { title: "Zalo: tài khoản cá nhân" };

export default async function ZaloAccountsPage() {
  await requireAdmin();
  const rows = await db.zaloAccount.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { contacts: true } } },
  });
  const accounts: AccountRow[] = rows.map((a) => ({
    id: a.id,
    name: a.name,
    phone: a.phone,
    avatarUrl: a.avatarUrl,
    status: a.status,
    lastError: a.lastError,
    lastConnectedAt: a.lastConnectedAt ? a.lastConnectedAt.toISOString() : null,
    autoConnect: a.autoConnect,
    contacts: a._count.contacts,
  }));
  return <AccountsBoard accounts={accounts} />;
}
