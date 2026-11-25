"use client";

import { useRef, useState } from "react";
import { CheckIcon, Loader2Icon, PinIcon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { MAX_STYLE_REF_PINS } from "@/lib/image-options";
import { cn } from "@/lib/utils";
import {
  listLogoFavoritePinsForPickerAction,
  listPinterestBoardsForPickerAction,
  listPinterestPinsForPickerAction,
  type PickerBoard,
  type PickerPin,
} from "./pinterest-actions";

/** Giá trị board ảo đại diện cho "pin khách đã thích" (LogoFavoritePin), hiện ở đầu danh sách board khi có. */
const FAVORITES_ID = "__favorites__";

/**
 * Chọn tối đa MAX_STYLE_REF_PINS pin Pinterest làm ảnh phong cách tham khảo cho AI khi thiết kế (không bắt buộc).
 * Board/pin đọc từ CSDL (đã đồng bộ ở /admin/pinterest), không gọi Pinterest trực tiếp từ đây. Mở lên tự gợi ý:
 * ưu tiên pin khách đã thích (nếu có), không thì board khớp công nghệ chất liệu đang chọn, cuối cùng mới tới board
 * đầu danh sách.
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
  const [boards, setBoards] = useState<PickerBoard[] | null>(null);
  const [favorites, setFavorites] = useState<PickerPin[]>([]);
  const [boardId, setBoardId] = useState("");
  const [pins, setPins] = useState<PickerPin[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  function openDialog() {
    setOpen(true);
    if (boards !== null) return;
    setError(null);
    Promise.all([listPinterestBoardsForPickerAction(), logoId ? listLogoFavoritePinsForPickerAction(logoId) : Promise.resolve([])])
      .then(([list, favs]) => {
        setBoards(list);
        setFavorites(favs);
        if (favs.length > 0) {
          setBoardId(FAVORITES_ID);
          setPins(favs);
          return;
        }
        const preferredBoard = list.find((b) => b.techniqueHint && preferredTechniques.includes(b.techniqueHint));
        if (preferredBoard) void selectBoard(preferredBoard.id);
        else if (list.length > 0) void selectBoard(list[0].id);
      })
      .catch((e: unknown) => {
        setBoards([]);
        setError(e instanceof Error ? e.message : "Không tải được danh sách board Pinterest.");
      });
  }

  async function selectBoard(id: string) {
    if (id === FAVORITES_ID) {
      setBoardId(id);
      setPins(favorites);
      setNextOffset(null);
      setError(null);
      return;
    }
    const currentRequest = ++requestId.current;
    setBoardId(id);
    setPins(null);
    setNextOffset(null);
    setError(null);
    try {
      const page = await listPinterestPinsForPickerAction(id);
      if (currentRequest !== requestId.current) return;
      setPins(page.items);
      setNextOffset(page.nextOffset);
    } catch (e) {
      if (currentRequest !== requestId.current) return;
      setPins([]);
      setError(e instanceof Error ? e.message : "Không tải được pin Pinterest.");
    }
  }

  async function loadMore() {
    if (nextOffset === null) return;
    const offset = nextOffset;
    setNextOffset(null);
    setError(null);
    try {
      const page = await listPinterestPinsForPickerAction(boardId, offset);
      setPins((current) => [...(current ?? []), ...page.items]);
      setNextOffset(page.nextOffset);
    } catch (e) {
      setNextOffset(offset);
      setError(e instanceof Error ? e.message : "Không tải thêm được pin Pinterest.");
    }
  }

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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button type="button" variant="outline" onClick={openDialog} disabled={atMax} />}>
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

          {boards === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Đang tải...</p>
          ) : boards.length === 0 && favorites.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Chưa có board Pinterest nào được đồng bộ. Nhờ quản trị viên kết nối ở mục Pinterest trong menu.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <NativeSelect value={boardId} onChange={(e) => void selectBoard(e.target.value)} aria-label="Board" className="max-w-xs">
                  {favorites.length > 0 && <option value={FAVORITES_ID}>★ Khách đã thích ({favorites.length})</option>}
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.pinCount} pin)
                    </option>
                  ))}
                </NativeSelect>
                <span className="text-sm text-muted-foreground">Đã chọn {selected.length}/{MAX_STYLE_REF_PINS}</span>
              </div>
              {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
              {pins === null ? (
                <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2Icon className="animate-spin" /> Đang tải...</p>
              ) : pins.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Board này chưa có pin nào dùng được.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {pins.map((p) => {
                      const isSelected = selected.some((s) => s.id === p.id);
                      const disabled = !isSelected && atMax;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggle(p)}
                          disabled={disabled}
                          title={p.title ?? undefined}
                          className={cn(
                            "relative overflow-hidden rounded-lg border transition-colors",
                            isSelected ? "border-primary ring-2 ring-primary" : "hover:border-primary",
                            disabled && "cursor-not-allowed opacity-40",
                          )}
                        >
                          <img src={p.sourceImageUrl} alt={p.title ?? "Pin"} className="aspect-square w-full object-cover" loading="lazy" />
                          {isSelected && (
                            <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <CheckIcon className="size-3" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {nextOffset !== null && (
                    <Button type="button" variant="outline" className="self-center" onClick={() => void loadMore()}>
                      Tải thêm pin
                    </Button>
                  )}
                </>
              )}
              <Button type="button" className="self-end" onClick={() => setOpen(false)}>
                Xong
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
