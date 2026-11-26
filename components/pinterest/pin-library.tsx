"use client";

import { useRef, useState } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import {
  listLogoFavoritePinsForPickerAction,
  listPinterestBoardsForPickerAction,
  listPinterestPinsForPickerAction,
  type PickerBoard,
  type PickerPin,
} from "@/app/(app)/sessions/[id]/design/pinterest-actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

/** Giá trị board ảo đại diện cho "pin khách đã thích" (LogoFavoritePin), hiện ở đầu danh sách board khi có. */
const FAVORITES_ID = "__favorites__";

/**
 * Dữ liệu duyệt kho mẫu Pinterest (board và pin đã đồng bộ vào CSDL, không gọi Pinterest trực tiếp), dùng chung cho ô chọn
 * ảnh phong cách ở Bước 2 và hộp "Thiết kế theo mẫu Pinterest". Gọi `load()` khi mở lên; lần đầu tự gợi ý: ưu tiên pin
 * khách đã thích (nếu có), không thì board khớp công nghệ chất liệu đang chọn, cuối cùng mới tới board đầu danh sách.
 */
export function usePinLibrary(logoId: string, preferredTechniques: string[] = []) {
  const [boards, setBoards] = useState<PickerBoard[] | null>(null);
  const [favorites, setFavorites] = useState<PickerPin[]>([]);
  const [boardId, setBoardId] = useState("");
  const [pins, setPins] = useState<PickerPin[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const started = useRef(false);

  function load() {
    if (started.current) return;
    started.current = true;
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
        if (preferredBoard) void selectBoard(preferredBoard.id, favs);
        else if (list.length > 0) void selectBoard(list[0].id, favs);
      })
      .catch((e: unknown) => {
        setBoards([]);
        setError(e instanceof Error ? e.message : "Không tải được danh sách board Pinterest.");
      });
  }

  async function selectBoard(id: string, favs: PickerPin[] = favorites) {
    if (id === FAVORITES_ID) {
      requestId.current++;
      setBoardId(id);
      setPins(favs);
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

  return { boards, favorites, boardId, pins, nextOffset, error, load, selectBoard, loadMore };
}

export type PinLibrary = ReturnType<typeof usePinLibrary>;

/** Ô chọn board và lưới pin để bấm chọn / bỏ chọn, tối đa `max` pin. */
export function PinLibraryBrowser({
  lib,
  selected,
  max,
  onToggle,
  gridClassName,
}: {
  lib: PinLibrary;
  selected: PickerPin[];
  max: number;
  onToggle: (pin: PickerPin) => void;
  /** lớp CSS của lưới pin, mặc định 3-4 cột */
  gridClassName?: string;
}) {
  const { boards, favorites, boardId, pins, nextOffset, error } = lib;
  const atMax = selected.length >= max;

  if (boards === null) return <p className="py-8 text-center text-sm text-muted-foreground">Đang tải...</p>;
  if (boards.length === 0 && favorites.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {error ?? "Chưa có board Pinterest nào được đồng bộ. Nhờ quản trị viên kết nối ở Hệ thống > Kết nối > Pinterest."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <NativeSelect value={boardId} onChange={(e) => void lib.selectBoard(e.target.value)} aria-label="Board" className="max-w-xs">
          {favorites.length > 0 && <option value={FAVORITES_ID}>★ Khách đã thích ({favorites.length})</option>}
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.pinCount} pin)
            </option>
          ))}
        </NativeSelect>
        <span className="text-sm text-muted-foreground">
          Đã chọn {selected.length}/{max}
        </span>
      </div>
      {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
      {pins === null ? (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2Icon className="animate-spin" /> Đang tải...
        </p>
      ) : pins.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Board này chưa có pin nào dùng được.</p>
      ) : (
        <>
          <div className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4", gridClassName)}>
            {pins.map((p) => {
              const isSelected = selected.some((s) => s.id === p.id);
              const disabled = !isSelected && atMax;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onToggle(p)}
                  disabled={disabled}
                  title={p.title ?? undefined}
                  aria-pressed={isSelected}
                  data-pin-id={p.id}
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
            <Button type="button" variant="outline" className="self-center" onClick={() => void lib.loadMore()}>
              Tải thêm pin
            </Button>
          )}
        </>
      )}
    </div>
  );
}
