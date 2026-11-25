"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRightIcon, PinIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Explorer } from "@/components/customers/explorer";
import { QuickCreate, type QuickCreateData } from "@/components/customers/quick-create";
import { useFolderNav } from "@/components/customers/use-folder-nav";
import { FolderTile, TileGrid } from "@/components/folder-ui";
import { cn } from "@/lib/utils";
import {
  listLogoFavoritePinsAction,
  listLogoSessionsAction,
  removeLogoFavoritePinAction,
  type CustomerOption,
  type LogoFavoritePinOption,
  type LogoSessionOption,
} from "../sessions/new/actions";

/**
 * Trang Khách hàng: duyệt thư mục Khách hàng > Thương hiệu > Logo, mở lại các phiên đã làm,
 * và TẠO NGAY phiên mới với logo đang chọn (nút Tạo nhanh dùng trang mẫu mặc định) mà không cần qua Trang chính.
 */
export function CustomerBrowser({ customers, quick }: { customers: CustomerOption[]; quick: QuickCreateData }) {
  const nav = useFolderNav(customers, null);
  return (
    <Explorer
      nav={nav}
      autoCreate
      logoFooter={
        nav.logo ? (
          <LogoPanel key={nav.logo.id} logoId={nav.logo.id} quick={quick} />
        ) : (
          <p className="border-t pt-4 text-sm text-muted-foreground">
            Tải logo mới lên để AI tự chọn chất liệu hợp và tạo ảnh mẫu, hoặc bấm vào một logo có sẵn để tạo phiên mới hay xem các phiên đã làm.
          </p>
        )
      }
    />
  );
}

function LogoPanel({ logoId, quick }: { logoId: string; quick: QuickCreateData }) {
  const [sessions, setSessions] = useState<LogoSessionOption[] | null>(null);
  const [favorites, setFavorites] = useState<LogoFavoritePinOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listLogoSessionsAction(logoId).then((r) => {
      if (!cancelled) setSessions(r.sessions);
    });
    listLogoFavoritePinsAction(logoId).then((r) => {
      if (!cancelled) setFavorites(r.favorites);
    });
    return () => {
      cancelled = true;
    };
  }, [logoId]);

  function removeFavorite(favoriteId: string) {
    setFavorites((cur) => cur?.filter((f) => f.id !== favoriteId) ?? cur);
    void removeLogoFavoritePinAction(favoriteId).then((r) => {
      if (r.error) toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <div className="flex flex-wrap gap-2">
        <QuickCreate logoId={logoId} data={quick}>
          <Link href={`/?logoId=${encodeURIComponent(logoId)}`} className={cn(buttonVariants({ variant: "outline" }), "h-12 px-5")}>
            Chọn trang mẫu khác
            <ChevronRightIcon />
          </Link>
        </QuickCreate>
        <Link href={`/pinterest?logoId=${encodeURIComponent(logoId)}`} className={cn(buttonVariants({ variant: "outline" }), "h-12 px-5")}>
          <PinIcon /> Chọn mẫu Pinterest cho khách
        </Link>
      </div>

      {favorites && favorites.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Pin khách đã thích ({favorites.length})</p>
          <div className="flex flex-wrap gap-2">
            {favorites.map((f) => (
              <div key={f.id} className="group relative size-16 overflow-hidden rounded-lg border">
                <img src={f.sourceImageUrl} alt={f.title ?? "Pin"} className="size-full object-cover" loading="lazy" />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-0.5 right-0.5 size-5 opacity-0 transition-opacity group-hover:opacity-100"
                  title="Bỏ lưu pin này"
                  aria-label="Bỏ lưu pin này"
                  onClick={() => removeFavorite(f.id)}
                >
                  <XIcon className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

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
