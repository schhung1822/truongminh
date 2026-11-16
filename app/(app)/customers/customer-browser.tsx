"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Explorer } from "@/components/customers/explorer";
import { QuickCreate, type QuickCreateData } from "@/components/customers/quick-create";
import { useFolderNav } from "@/components/customers/use-folder-nav";
import { FolderTile, TileGrid } from "@/components/folder-ui";
import { cn } from "@/lib/utils";
import { listLogoSessionsAction, type CustomerOption, type LogoSessionOption } from "../sessions/new/actions";

/**
 * Trang Khách hàng: duyệt thư mục Khách hàng > Thương hiệu > Logo, mở lại các phiên đã làm,
 * và TẠO NGAY phiên mới với logo đang chọn (nút Tạo nhanh dùng trang mẫu mặc định) mà không cần qua Trang chính.
 */
export function CustomerBrowser({ customers, quick }: { customers: CustomerOption[]; quick: QuickCreateData }) {
  const nav = useFolderNav(customers, null);
  return (
    <Explorer
      nav={nav}
      logoFooter={
        nav.logo ? (
          <LogoPanel key={nav.logo.id} logoId={nav.logo.id} quick={quick} />
        ) : (
          <p className="border-t pt-4 text-sm text-muted-foreground">
            Bấm vào một logo để tạo phiên mới ngay hoặc xem các phiên đã làm với logo đó.
          </p>
        )
      }
    />
  );
}

function LogoPanel({ logoId, quick }: { logoId: string; quick: QuickCreateData }) {
  const [sessions, setSessions] = useState<LogoSessionOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listLogoSessionsAction(logoId).then((r) => {
      if (!cancelled) setSessions(r.sessions);
    });
    return () => {
      cancelled = true;
    };
  }, [logoId]);

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <QuickCreate logoId={logoId} data={quick}>
        <Link href={`/?logoId=${encodeURIComponent(logoId)}`} className={cn(buttonVariants({ variant: "outline" }), "h-12 px-5")}>
          Chọn trang mẫu khác
          <ChevronRightIcon />
        </Link>
      </QuickCreate>

      <p className="text-sm text-muted-foreground">
        {sessions === null
          ? "Đang tải các phiên..."
          : sessions.length === 0
            ? "Logo này chưa có phiên nào."
            : `${sessions.length} phiên đã làm với logo này:`}
      </p>
      {sessions && sessions.length > 0 && (
        <TileGrid>
          {sessions.map((s) => (
            <FolderTile
              key={s.id}
              href={`/sessions/${s.id}`}
              name={`Phiên ${s.createdAt}`}
              subtitle={s.creatorName}
              footer={
                s.running > 0
                  ? `${s.running} đang tạo · ${s.done}/${s.total} xong`
                  : s.failed > 0
                    ? `${s.failed} lỗi · ${s.done}/${s.total} xong`
                    : `${s.done}/${s.total} ảnh xong`
              }
              tone={s.running > 0 ? "busy" : s.failed > 0 ? "error" : "default"}
            />
          ))}
        </TileGrid>
      )}
    </div>
  );
}
