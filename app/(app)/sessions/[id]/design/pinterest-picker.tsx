"use client";

import { useState } from "react";
import { PinIcon, PlusIcon, XIcon } from "lucide-react";
import { PinLibraryBrowser, usePinLibrary } from "@/components/pinterest/pin-library";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MAX_STYLE_REF_PINS } from "@/lib/image-options";
import type { PickerPin } from "./pinterest-actions";

/**
 * Chọn tối đa MAX_STYLE_REF_PINS pin Pinterest làm ảnh phong cách tham khảo cho AI khi thiết kế (không bắt buộc).
 * Board/pin đọc từ CSDL (đã đồng bộ ở /admin/connections/pinterest), không gọi Pinterest trực tiếp từ đây. Mở lên tự gợi ý:
 * ưu tiên pin khách đã thích (nếu có), không thì board khớp công nghệ chất liệu đang chọn, cuối cùng mới tới board
 * đầu danh sách (xem usePinLibrary).
 */
export function PinterestStylePicker({
  selected,
  onSelect,
  logoId,
  preferredTechniques,
}: {
  selected: PickerPin[];
  onSelect: (pins: PickerPin[]) => void;
  logoId: string;
  preferredTechniques: string[];
}) {
  const [open, setOpen] = useState(false);
  const lib = usePinLibrary(logoId, preferredTechniques);

  function toggle(pin: PickerPin) {
    const already = selected.some((p) => p.id === pin.id);
    if (already) {
      onSelect(selected.filter((p) => p.id !== pin.id));
    } else if (selected.length < MAX_STYLE_REF_PINS) {
      onSelect([...selected, pin]);
    }
  }

  function remove(pinId: string) {
    onSelect(selected.filter((p) => p.id !== pinId));
  }

  const atMax = selected.length >= MAX_STYLE_REF_PINS;

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((pin) => (
            <div key={pin.id} className="group relative size-16 overflow-hidden rounded-lg border">
              <img src={pin.sourceImageUrl} alt={pin.title ?? "Ảnh phong cách tham khảo"} className="size-full object-cover" />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-0.5 right-0.5 size-5 opacity-0 transition-opacity group-hover:opacity-100"
                title="Bỏ ảnh này"
                aria-label="Bỏ ảnh này"
                onClick={() => remove(pin.id)}
              >
                <XIcon className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) lib.load();
        }}
      >
        <DialogTrigger render={<Button type="button" variant="outline" disabled={atMax} />}>
          {selected.length > 0 ? <PlusIcon /> : <PinIcon />}
          {selected.length > 0
            ? `Thêm ảnh phong cách (${selected.length}/${MAX_STYLE_REF_PINS})`
            : `Chọn ảnh phong cách từ Pinterest (không bắt buộc, tối đa ${MAX_STYLE_REF_PINS})`}
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Chọn ảnh phong cách tham khảo</DialogTitle>
            <DialogDescription>
              AI sẽ nhìn thêm (các) ảnh này để lấy cảm hứng về màu sắc, không khí và bối cảnh — không chép lại logo hay nội dung
              của ảnh. Chọn tối đa {MAX_STYLE_REF_PINS} ảnh, bấm vào ảnh đã chọn để bỏ.
            </DialogDescription>
          </DialogHeader>

          <PinLibraryBrowser lib={lib} selected={selected} max={MAX_STYLE_REF_PINS} onToggle={toggle} />
          {lib.boards !== null && (lib.boards.length > 0 || lib.favorites.length > 0) && (
            <Button type="button" className="justify-self-end" onClick={() => setOpen(false)}>
              Xong
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
