"use client";

import { useRef, useState } from "react";
import { Loader2Icon, PinIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { listPinterestBoardsForPickerAction, listPinterestPinsForPickerAction, type PickerBoard, type PickerPin } from "./pinterest-actions";

/**
 * Chọn một pin Pinterest làm ảnh phong cách tham khảo cho AI khi thiết kế (không bắt buộc). Board/pin đọc từ CSDL
 * (đã đồng bộ ở /admin/pinterest), không gọi Pinterest trực tiếp từ đây.
 */
export function PinterestStylePicker({ selected, onSelect }: { selected: PickerPin | null; onSelect: (pin: PickerPin | null) => void }) {
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState<PickerBoard[] | null>(null);
  const [boardId, setBoardId] = useState("");
  const [pins, setPins] = useState<PickerPin[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  function openDialog() {
    setOpen(true);
    if (boards !== null) return;
    setError(null);
    void listPinterestBoardsForPickerAction()
      .then((list) => {
        setBoards(list);
        if (list.length > 0) void selectBoard(list[0].id);
      })
      .catch((e: unknown) => {
        setBoards([]);
        setError(e instanceof Error ? e.message : "Không tải được danh sách board Pinterest.");
      });
  }

  async function selectBoard(id: string) {
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

  function pick(pin: PickerPin) {
    onSelect(pin);
    setOpen(false);
  }

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-lg border p-2">
        <img src={selected.sourceImageUrl} alt={selected.title ?? "Ảnh phong cách tham khảo"} className="size-14 rounded-md object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{selected.title || "Ảnh phong cách đã chọn"}</p>
          <button type="button" className="text-xs text-muted-foreground underline underline-offset-4" onClick={() => onSelect(null)}>
            Bỏ chọn
          </button>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" onClick={openDialog} />}>
        <PinIcon /> Chọn ảnh phong cách từ Pinterest (không bắt buộc)
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chọn ảnh phong cách tham khảo</DialogTitle>
          <DialogDescription>
            AI sẽ nhìn thêm ảnh này để lấy cảm hứng về màu sắc, không khí và bối cảnh — không chép lại logo hay nội dung của ảnh.
          </DialogDescription>
        </DialogHeader>

        {boards === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Đang tải...</p>
        ) : boards.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Chưa có board Pinterest nào được đồng bộ. Nhờ quản trị viên kết nối ở mục Pinterest trong menu.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <NativeSelect value={boardId} onChange={(e) => void selectBoard(e.target.value)} aria-label="Board">
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.pinCount} pin)
                </option>
              ))}
            </NativeSelect>
            {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
            {pins === null ? (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2Icon className="animate-spin" /> Đang tải...</p>
            ) : pins.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Board này chưa có pin nào dùng được.</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {pins.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pick(p)}
                      title={p.title ?? undefined}
                      className="overflow-hidden rounded-lg border transition-colors hover:border-primary"
                    >
                      <img src={p.sourceImageUrl} alt={p.title ?? "Pin"} className="aspect-square w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
                {nextOffset !== null && (
                  <Button type="button" variant="outline" className="self-center" onClick={() => void loadMore()}>
                    Tải thêm pin
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
