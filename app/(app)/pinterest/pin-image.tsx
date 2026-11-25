"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Ảnh pin kiểu Pinterest: không ép tỉ lệ vuông, hiện đúng tỉ lệ ảnh gốc (masonry) sau khi tải xong.
 * Trong lúc chờ tải, giữ một khung tạm 3:4 có hiệu ứng skeleton để lưới không bị giật khi ảnh về.
 */
export function PinImage({ src, alt, isNew }: { src: string; alt: string; isNew?: boolean }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={cn("relative w-full overflow-hidden bg-muted", !loaded && "aspect-[3/4]")}>
      {isNew && <Badge className="absolute top-1.5 left-1.5 z-10">Mới</Badge>}
      {!loaded && <div className="absolute inset-0 animate-pulse bg-muted" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={cn(
          "w-full transition-all duration-300 group-hover:scale-105",
          loaded ? "h-auto opacity-100" : "absolute inset-0 h-full object-cover opacity-0",
        )}
      />
    </div>
  );
}
