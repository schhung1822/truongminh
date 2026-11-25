"use client";

import { useCallback, useEffect, useState } from "react";
import { CoinsIcon, WalletIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/generated/prisma/enums";
import type { UsageSummary } from "@/lib/usage-summary";

const REFRESH_MS = 30_000;
const LOW_BALANCE = 500; // dưới mức này thì tô đỏ để nhắc nạp thêm

const nf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

/** Tải số liệu token, có tự làm mới định kỳ và khi trang kết quả phiên báo "vừa xong ảnh". */
function useUsageSummary(): UsageSummary | null {
  const [data, setData] = useState<UsageSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/usage/summary", { cache: "no-store" });
      if (res.ok) setData((await res.json()) as UsageSummary);
    } catch {
      /* giữ số liệu cũ, lần sau thử lại */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp dữ liệu lần đầu từ server
    void load();
    const t = setInterval(load, REFRESH_MS);
    window.addEventListener("usage:refresh", load);
    return () => {
      clearInterval(t);
      window.removeEventListener("usage:refresh", load);
    };
  }, [load]);

  return data;
}

type StatItem = { icon: React.ReactNode; label: string; value: string; title?: string; tone?: "default" | "warn" };

/** Danh sách mục cần hiện (icon/nhãn/giá trị), dùng chung cho cả kiểu "viên thuốc" ở đầu trang và kiểu hàng trong menu tài khoản. */
function statItems(data: UsageSummary | null): StatItem[] | null {
  if (!data) return null;
  if (data.role === "SALE") {
    if (!data.quota) return [];
    return [
      {
        icon: <CoinsIcon />,
        label: "Lượt tạo ảnh hôm nay",
        value: `Còn ${data.quota.left}/${data.quota.limit}`,
        title: `Đã dùng ${data.quota.used} lượt hôm nay`,
        tone: data.quota.left === 0 ? "warn" : "default",
      },
    ];
  }
  const isMock = data.provider === "mock";
  const low = data.balance !== null && data.balance < LOW_BALANCE;
  return [
    {
      icon: <CoinsIcon />,
      label: "Token đã dùng",
      value: nf.format(data.spentTotal),
      title: `Tổng ${nf.format(data.spentTotal)} token đã trừ cho ${data.imagesTotal} ảnh tạo qua web (hôm nay: ${nf.format(data.spentToday)})`,
    },
    {
      icon: <WalletIcon />,
      label: isMock ? "Chế độ" : "Token còn lại",
      value: isMock ? "Ảnh giả" : data.balance === null ? "?" : nf.format(data.balance),
      title: isMock
        ? "Đang dùng ảnh giả: không tốn token"
        : data.balance === null
          ? "Không hỏi được số dư kie.ai, hãy kiểm tra khóa API"
          : `Số dư kie.ai hiện tại${low ? " (sắp hết, nên nạp thêm)" : ""}`,
      tone: low ? "warn" : "default",
    },
  ];
}

function Pill({ item }: { item: StatItem }) {
  return (
    <div
      title={item.title}
      className={cn(
        "flex h-9 items-center gap-2 rounded-lg border px-2.5 text-xs",
        item.tone === "warn" ? "border-red-400/40 bg-red-500/15 text-red-200" : "border-white/15 bg-white/5 text-white/70",
      )}
    >
      <span className="[&_svg]:size-4">{item.icon}</span>
      <span className="hidden sm:inline">{item.label}</span>
      <span className="text-sm font-semibold tabular-nums text-white">{item.value}</span>
    </div>
  );
}

/** Thống kê token kiểu "viên thuốc" ở bên phải thanh đầu trang (chỉ hiện ở màn rộng, xem AccountMenuStats cho di động). */
export function HeaderStats({ role }: { role: Role }) {
  const data = useUsageSummary();
  const items = statItems(data);

  if (!data) return <div className="h-9 w-40 animate-pulse rounded-lg bg-white/10" aria-hidden />;
  if (!items || items.length === 0) return null;
  return (
    <div className="flex items-center gap-2" data-role={role}>
      {items.map((item) => (
        <Pill key={item.label} item={item} />
      ))}
    </div>
  );
}

function Row({ item }: { item: StatItem }) {
  return (
    <div title={item.title} className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
      <span className={cn("flex items-center gap-2", item.tone === "warn" ? "text-destructive" : "text-muted-foreground")}>
        <span className="[&_svg]:size-4">{item.icon}</span>
        {item.label}
      </span>
      <span className={cn("font-semibold tabular-nums", item.tone === "warn" ? "text-destructive" : "text-foreground")}>{item.value}</span>
    </div>
  );
}

/** Cùng số liệu token, hiện dạng hàng gọn trong menu tài khoản — dùng thay cho HeaderStats trên di động để đỡ chật thanh đầu trang. */
export function AccountMenuStats() {
  const data = useUsageSummary();
  const items = statItems(data);
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <Row key={item.label} item={item} />
      ))}
    </div>
  );
}
