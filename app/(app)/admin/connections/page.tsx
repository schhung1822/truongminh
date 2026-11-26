import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin, requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getEnv, getPinterestConfig } from "@/lib/env";
import { fmtAgo } from "@/lib/fb/format";
import { USD_PER_CREDIT } from "@/lib/pricing";
import { getKieCredits } from "@/lib/providers";
import { getZaloSettings } from "@/lib/zalo/settings";
import { PlatformBadge, type Platform } from "./platform-icon";
import { StatusPill, type Tone } from "./status";

export const metadata: Metadata = { title: "Kết nối" };

type Summary = { href: string; platform: Platform; title: string; purpose: string; tone: Tone; status: string; facts: string[] };

const ONLINE_WINDOW_MS = 30 * 60_000; // máy có extension hỏi việc trong 30 phút gần đây coi là đang chạy

function ago(ms: number): Date {
  return new Date(Date.now() - ms);
}

export default async function ConnectionsOverviewPage() {
  const user = await requireUser();
  if (user.role === "MKT") redirect("/admin/connections/extension"); // marketing chỉ có mục extension
  await requireAdmin();

  const env = getEnv();
  const [fbByStatus, tokens, onlineTokens, extWarnings, pinterest, credits, bots, zaloAccounts, zalo] = await Promise.all([
    db.fbAccount.groupBy({ by: ["status"], _count: { _all: true } }),
    db.extToken.count({ where: { revokedAt: null } }),
    db.extToken.count({ where: { revokedAt: null, lastSeenAt: { gte: ago(ONLINE_WINDOW_MS) } } }),
    db.extLog.count({ where: { type: { in: ["SELECTOR_BROKEN", "CHECKPOINT", "SCAN_FAIL"] }, createdAt: { gte: ago(14 * 24 * 3600_000) } } }),
    db.pinterestAccount.findFirst({ select: { username: true, lastSyncedAt: true, lastSyncError: true, _count: { select: { boards: true } } } }),
    env.IMAGE_PROVIDER === "kie" ? getKieCredits() : Promise.resolve(null),
    db.zaloBot.findMany({ select: { isActive: true, lastError: true } }),
    db.zaloAccount.findMany({ select: { status: true } }),
    getZaloSettings(),
  ]);

  // Extension Facebook
  const nicks = fbByStatus.reduce((n, r) => n + r._count._all, 0);
  const restricted = fbByStatus.find((r) => r.status === "RESTRICTED")?._count._all ?? 0;
  const extension: Summary = {
    href: "/admin/connections/extension",
    platform: "facebook",
    title: "Extension Facebook",
    purpose: "Extension Chrome đọc comment trên bài đang theo dõi để tìm lead.",
    ...(nicks === 0
      ? { tone: "off", status: "Chưa kết nối" }
      : restricted > 0
        ? { tone: "error", status: `${restricted} nick bị hạn chế` }
        : extWarnings > 0
          ? { tone: "warn", status: "Có cảnh báo" }
          : { tone: "ok", status: "Đang hoạt động" }),
    facts: [`${nicks} nick Facebook`, `${tokens} máy có mã kết nối`, `${onlineTokens} máy vừa hoạt động`, ...(extWarnings > 0 ? [`${extWarnings} cảnh báo trong 14 ngày`] : [])],
  };

  // Pinterest
  const pinterestConfigured = !!getPinterestConfig();
  const pin: Summary = {
    href: "/admin/connections/pinterest",
    platform: "pinterest",
    title: "Pinterest",
    purpose: "Board và pin của xưởng dùng làm ảnh mẫu và ảnh phong cách tham khảo.",
    ...(!pinterestConfigured
      ? { tone: "off", status: "Chưa cấu hình" }
      : !pinterest
        ? { tone: "off", status: "Chưa kết nối" }
        : pinterest.lastSyncError
          ? { tone: "warn", status: "Đồng bộ lỗi" }
          : { tone: "ok", status: "Đã kết nối" }),
    facts: pinterest
      ? [`@${pinterest.username}`, `${pinterest._count.boards} board`, pinterest.lastSyncedAt ? `Đồng bộ ${fmtAgo(pinterest.lastSyncedAt)}` : "Chưa đồng bộ lần nào"]
      : [pinterestConfigured ? "Chưa có tài khoản Pinterest nào" : "Thiếu khóa App Pinterest trong .env"],
  };

  // Kie.ai
  const kie: Summary = {
    href: "/admin/connections/kie",
    platform: "kie",
    title: "Kie.ai",
    purpose: "Dịch vụ AI tạo ảnh mẫu và chạy các trợ lý chat.",
    ...(env.IMAGE_PROVIDER !== "kie"
      ? { tone: "off", status: "Đang dùng ảnh giả" }
      : credits === null
        ? { tone: "error", status: "Không hỏi được số dư" }
        : { tone: "ok", status: "Đang kết nối" }),
    facts:
      env.IMAGE_PROVIDER !== "kie"
        ? ["Chế độ mock, không tốn tiền"]
        : credits === null
          ? ["Kiểm tra lại khóa API"]
          : [`Số dư ${credits.toLocaleString("vi-VN")} token`, `Khoảng $${(credits * USD_PER_CREDIT).toFixed(2)}`],
  };

  // Zalo
  const activeBots = bots.filter((b) => b.isActive).length + (env.ZALO_BOT_TOKEN ? 1 : 0);
  const botErrors = bots.filter((b) => b.isActive && b.lastError).length;
  const personalOn = zaloAccounts.filter((a) => a.status === "CONNECTED").length;
  const personalOut = zaloAccounts.filter((a) => a.status === "LOGGED_OUT").length;
  const zaloCard: Summary = {
    href: "/admin/connections/zalo",
    platform: "zalo",
    title: "Zalo",
    purpose: "Bot Zalo gửi ảnh, nhận lệnh trong nhóm; tài khoản Zalo cá nhân cho Hộp thư.",
    ...(activeBots === 0 && zaloAccounts.length === 0
      ? { tone: "off", status: "Chưa kết nối" }
      : !zalo.enabled
        ? { tone: "warn", status: "Zalo đang tắt" }
        : botErrors > 0 || personalOut > 0
          ? { tone: "warn", status: "Cần kiểm tra" }
          : { tone: "ok", status: "Đang hoạt động" }),
    facts: [
      `${activeBots} bot đang bật`,
      `${personalOn}/${zaloAccounts.length} tài khoản cá nhân đang kết nối`,
      ...(botErrors > 0 ? [`${botErrors} bot báo lỗi`] : []),
      ...(personalOut > 0 ? [`${personalOut} tài khoản cần quét QR lại`] : []),
    ],
  };

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {[extension, pin, kie, zaloCard].map((c) => (
        <li key={c.href}>
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-start gap-3">
                <PlatformBadge platform={c.platform} />
                <div className="min-w-0 flex-1">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {c.title}
                    <StatusPill tone={c.tone}>{c.status}</StatusPill>
                  </CardTitle>
                  <CardDescription className="mt-1">{c.purpose}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-4">
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {c.facts.map((f) => (
                  <li key={f} className="text-muted-foreground">
                    {f}
                  </li>
                ))}
              </ul>
              <Link href={c.href} className="flex w-fit items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
                Quản lý <ArrowRightIcon className="size-4" />
              </Link>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
