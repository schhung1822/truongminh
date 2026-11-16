"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SparklesIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Explorer } from "@/components/customers/explorer";
import { useFolderNav } from "@/components/customers/use-folder-nav";
import { FolderTile, TileGrid } from "@/components/folder-ui";
import { listLogoSessionsAction, type CustomerOption, type LogoSessionOption } from "../sessions/new/actions";

/** Trang Khách hàng: duyệt thư mục Khách hàng > Thương hiệu > Logo, mở lại các phiên đã làm, hoặc tạo phiên mới từ logo. */
export function CustomerBrowser({ customers }: { customers: CustomerOption[] }) {
  const nav = useFolderNav(customers, null);
  return (
    <Explorer
      nav={nav}
      logoFooter={nav.logo ? <LogoPanel key={nav.logo.id} logoId={nav.logo.id} /> : <p className="border-t pt-4 text-sm text-muted-foreground">Bấm vào một logo để xem các phiên đã làm với logo đó.</p>}
    />
  );
}

function LogoPanel({ logoId }: { logoId: string }) {
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
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/?logoId=${encodeURIComponent(logoId)}`} className={buttonVariants({ className: "h-11 px-5" })}>
          <SparklesIcon /> Tạo phiên mới với logo này
        </Link>
        <span className="text-sm text-muted-foreground">
          {sessions === null ? "Đang tải các phiên..." : sessions.length === 0 ? "Logo này chưa có phiên nào." : `${sessions.length} phiên đã làm với logo này:`}
        </span>
      </div>
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
