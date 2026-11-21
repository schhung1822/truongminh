"use client";

import { useCallback, useEffect, useState } from "react";
import { CoinsIcon, WalletIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/generated/prisma/enums";
import type { UsageSummary } from "@/lib/usage-summary";

const REFRESH_MS = 30_000;
const LOW_BALANCE = 500; // dưới mức này thì tô đỏ để nhắc nạp thêm

const nf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

function Stat({
  icon,
  label,
  value,
  title,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  title?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div
      title={title}
      className={cn(
        "flex h-9 items-center gap-2 rounded-lg border px-2.5 text-xs",
        tone === "warn"
          ? "border-red-400/40 bg-red-500/15 text-red-200"
          : "border-white/15 bg-white/5 text-white/70",
      )}
    >
      <span className="[&_svg]:size-4">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-white">{value}</span>
    </div>
  );
}

/** Thống kê token ở bên phải thanh đầu trang. Admin thấy token đã dùng và số dư; sale thấy số lượt còn lại hôm nay. */
export function HeaderStats({ role }: { role: Role }) {
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
    // trang kết quả phiên báo "vừa xong ảnh" để cập nhật số token ngay
    window.addEventListener("usage:refresh", load);
    return () => {
      clearInterval(t);
      window.removeEventListener("usage:refresh", load);
    };
  }, [load]);

  if (!data) {
    return <div className="h-9 w-40 animate-pulse rounded-lg bg-white/10" aria-hidden />;
  }

  if (data.role === "SALE") {
    if (!data.quota) return null;
    return (
      <Stat
        icon={<CoinsIcon />}
        label="Lượt tạo ảnh hôm nay"
        value={`Còn ${data.quota.left}/${data.quota.limit}`}
        title={`Đã dùng ${data.quota.used} lượt hôm nay`}
        tone={data.quota.left === 0 ? "warn" : "default"}
      />
    );
  }

  const isMock = data.provider === "mock";
  const low = data.balance !== null && data.balance < LOW_BALANCE;
  return (
    <div className="flex items-center gap-2" data-role={role}>
      <Stat
        icon={<CoinsIcon />}
        label="Token đã dùng"
        value={nf.format(data.spentTotal)}
        title={`Tổng ${nf.format(data.spentTotal)} token đã trừ cho ${data.imagesTotal} ảnh tạo qua web (hôm nay: ${nf.format(data.spentToday)})`}
      />
      <Stat
        icon={<WalletIcon />}
        label={isMock ? "Chế độ" : "Token còn lại"}
        value={isMock ? "Ảnh giả" : data.balance === null ? "?" : nf.format(data.balance)}
        title={
          isMock
            ? "Đang dùng ảnh giả: không tốn token"
            : data.balance === null
              ? "Không hỏi được số dư kie.ai, hãy kiểm tra khóa API"
              : `Số dư kie.ai hiện tại${low ? " (sắp hết, nên nạp thêm)" : ""}`
        }
        tone={low ? "warn" : "default"}
      />
    </div>
  );
}
