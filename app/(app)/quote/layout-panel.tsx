"use client";

import { useState } from "react";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadSvgFile } from "./client-utils";
import { safeFileName } from "./format";
import { LayoutPreview, MAX_IMAGE_PLACEMENTS } from "./layout-preview";
import { layoutToSvg, type QuoteLayout } from "./layout-svg";

/** Hình xem trước bố cục kèm nút bật/tắt ảnh logo thật và nút tải SVG. Dùng ở trang tính và trang chi tiết báo giá. */
export function LayoutPanel({
  layout,
  logoUrl,
  title,
}: {
  layout: { stock: QuoteLayout["stock"] | null; placements: QuoteLayout["placements"]; label?: string };
  logoUrl?: string | null;
  /** tiêu đề ghi trong file SVG và dùng đặt tên file */
  title: string;
}) {
  const tooMany = layout.placements.length > MAX_IMAGE_PLACEMENTS;
  const [showImages, setShowImages] = useState(!!logoUrl && !tooMany);
  const stock = layout.stock;

  return (
    <div className="flex flex-col gap-3">
      <LayoutPreview stock={stock} placements={layout.placements} logoUrl={logoUrl} showImages={showImages && !tooMany} />
      <div className="flex flex-wrap items-center gap-3">
        {logoUrl && (
          <label className={`flex items-center gap-2 text-sm ${tooMany ? "text-muted-foreground" : ""}`}>
            <input
              type="checkbox"
              checked={showImages && !tooMany}
              disabled={tooMany}
              onChange={(e) => setShowImages(e.target.checked)}
              className="size-4"
            />
            Hiện ảnh logo trong từng ô
            {tooMany && <span className="text-xs">(quá nhiều logo, chỉ vẽ khung)</span>}
          </label>
        )}
        <Button
          type="button"
          variant="outline"
          className="ml-auto h-9"
          disabled={!stock}
          onClick={() => {
            if (!stock) return;
            downloadSvgFile(layoutToSvg({ stock, placements: layout.placements, label: layout.label }, { title }), safeFileName(title, "svg"));
          }}
        >
          <DownloadIcon />
          Tải SVG
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Hình chỉ để xem trước cách xếp và báo giá, không phải file sản xuất. Ảnh logo trong ô là minh họa gần đúng.
      </p>
    </div>
  );
}
