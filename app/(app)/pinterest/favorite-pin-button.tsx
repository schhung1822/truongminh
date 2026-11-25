"use client";

import { useState, useTransition } from "react";
import { HeartIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toggleLogoFavoritePinAction } from "./favorite-actions";

/** Nút tim lưu/bỏ lưu một pin cho logo đang xem (chỉ hiện khi vào trang qua ?logoId=...). */
export function FavoritePinButton({ logoId, pinId, label, initialFavorited }: { logoId: string; pinId: string; label: string; initialFavorited: boolean }) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const r = await toggleLogoFavoritePinAction(logoId, pinId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setFavorited(!!r.favorited);
      toast.success(r.favorited ? `Đã lưu ${label} cho khách.` : `Đã bỏ lưu ${label}.`);
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn("size-8", favorited && "border-rose-400 text-rose-500 hover:text-rose-500")}
      onClick={toggle}
      disabled={pending}
      title={favorited ? "Bỏ lưu cho khách" : "Lưu cho khách"}
      aria-label={favorited ? `Bỏ lưu ${label} cho khách` : `Lưu ${label} cho khách`}
    >
      <HeartIcon className={favorited ? "fill-current" : undefined} />
    </Button>
  );
}
