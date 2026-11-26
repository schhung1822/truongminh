"use client";

import { useEffect, useState } from "react";
import { ListChecksIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  listLogoFavoritePinsAction,
  listLogoSessionsAction,
  removeLogoFavoritePinAction,
  type LogoFavoritePinOption,
  type LogoSessionOption,
} from "@/app/(app)/sessions/new/actions";
import type { PickerPin } from "@/app/(app)/sessions/[id]/design/pinterest-actions";
import { FolderTile, TileGrid } from "@/components/folder-ui";
import { PinDesignDialog } from "@/components/pinterest/pin-design-dialog";
import { Button } from "@/components/ui/button";
import { ACTION_BUTTON_CLASS, ActionLabel } from "./action-label";
import { QuickCreate, type QuickCreateData } from "./quick-create";

/**
 * Khung của MỘT logo đang chọn, dùng chung cho Trang chính và mục Khách hàng: các nút tạo ảnh (AI chọn chất liệu, Tất cả
 * chất liệu, Chọn bộ chất liệu; tên đặt ở D126), nút Mẫu Pinterest (mở hộp thiết kế theo mẫu, D125), các pin khách đã thích, và danh sách các phiên
 * đã làm với logo này.
 * `onPickSheets`: bấm "Chọn bộ chất liệu" (nơi gọi chuyển sang bước chọn trang mẫu của mình).
 * `initialPins`: mẫu Pinterest đã chọn sẵn ở trang Mẫu Pinterest; có thì hộp thiết kế theo mẫu tự mở với mẫu đó.
 */
export function LogoPanel({
  logoId,
  quick,
  onPickSheets,
  initialPins,
}: {
  logoId: string;
  quick: QuickCreateData;
  onPickSheets: () => void;
  initialPins?: PickerPin[];
}) {
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
          <Button type="button" variant="outline" className={ACTION_BUTTON_CLASS} onClick={onPickSheets}>
            <ListChecksIcon />
            <ActionLabel title="Chọn bộ chất liệu" hint="Tự chọn trong các trang mẫu lập sẵn" />
          </Button>
          <PinDesignDialog
            logoId={logoId}
            design={quick.design}
            quota={quick.quota}
            showCost={quick.showCost}
            imageModel={quick.imageModel}
            isAdmin={quick.isAdmin}
            initialPins={initialPins}
          />
        </QuickCreate>
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
              name={s.pinDesign ? `Thiết kế ${s.createdAt}` : `Phiên ${s.createdAt}`}
              subtitle={s.pinDesign ? `Theo mẫu Pinterest · ${s.pinDesign} · ${s.creatorName}` : s.creatorName}
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
