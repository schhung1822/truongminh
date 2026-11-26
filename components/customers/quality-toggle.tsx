"use client";

import { GemIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { QUALITY_TILE_CELLS } from "@/lib/image-options";
import { cn } from "@/lib/utils";

const LONG = `AI chỉ vẽ ${QUALITY_TILE_CELLS} chất liệu mỗi lần rồi ghép lại thành một ảnh 2 cột: logo to, nét hơn, kiểu khắc sát thực tế hơn. Tốn gấp đôi lượt và token (ảnh 8 chất liệu tính 2 lượt).`;

/**
 * Ô chọn "Chất lượng cao" (D120) ở các màn hình tạo ảnh mẫu. Bật thì AI chỉ vẽ 4 chất liệu mỗi lần rồi hệ thống ghép lại:
 * logo to, nét hơn và kiểu khắc sát thực tế hơn, đổi lại tốn gấp đôi lượt và token. Mặc định bật/tắt do quản trị viên đặt.
 * `compact`: một dòng ngắn (giải thích đầy đủ nằm ở chú thích khi rê chuột), dùng cạnh các nút tạo nhanh.
 */
export function QualityToggle({
  checked,
  onChange,
  disabled,
  compact,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <label className={cn("flex w-fit cursor-pointer items-center gap-2 text-sm", className)} title={LONG}>
        <Checkbox checked={checked} onCheckedChange={(c) => onChange(c === true)} disabled={disabled} />
        <GemIcon className="size-4" />
        <span className="font-medium">Chất lượng cao</span>
        <span className="text-xs text-muted-foreground">logo to, nét hơn; tốn gấp đôi lượt</span>
      </label>
    );
  }
  return (
    <label className={cn("flex max-w-2xl cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors", checked && "border-primary/50 bg-primary/5", className)}>
      <Checkbox checked={checked} onCheckedChange={(c) => onChange(c === true)} disabled={disabled} className="mt-0.5" />
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 font-medium">
          <GemIcon className="size-4" /> Chất lượng cao
        </span>
        <span className="text-xs text-muted-foreground">{LONG}</span>
      </span>
    </label>
  );
}
