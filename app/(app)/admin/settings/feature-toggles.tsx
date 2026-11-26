"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { toggleZaloFeatureAction } from "@/app/(app)/admin/zalo/feature-actions";

/**
 * Các công tắc bật/tắt chức năng ở Hệ thống > Cấu hình. Hộp thư Zalo dùng chung công tắc `zalo.inbox` với trang
 * Cài đặt Zalo > Trợ lý AI: tắt thì mục Hộp thư Zalo ẩn khỏi menu của mọi người (docs/DECISIONS.md D117).
 */
export function FeatureToggles({ zaloInbox }: { zaloInbox: boolean }) {
  const [inbox, setInbox] = useState(zaloInbox);
  const [pending, startTransition] = useTransition();

  function changeInbox(value: boolean) {
    setInbox(value);
    startTransition(async () => {
      const r = await toggleZaloFeatureAction("inbox", value);
      if (r.error) {
        setInbox(!value);
        toast.error(r.error);
      } else toast.success(value ? "Đã bật Hộp thư Zalo, mục này hiện lại trên menu." : "Đã tắt Hộp thư Zalo, mục này đã ẩn khỏi menu.");
    });
  }

  return (
    <label className="flex items-start gap-3">
      <Switch checked={inbox} onCheckedChange={changeInbox} disabled={pending} className="mt-0.5" />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">Hộp thư Zalo</span>
        <span className="text-sm text-muted-foreground">
          Trang xem và trả lời hội thoại Zalo ngay trên web (menu Zalo &gt; Hộp thư Zalo). Tắt thì mục này ẩn khỏi menu của mọi người, nút &quot;AI soạn&quot; cũng ngừng, và tin khách nhắn bot không còn được lưu (trừ khi Trợ lý nhận lệnh đang
          bật). Gửi ảnh vào nhóm, trợ lý nhận lệnh và kịch bản chăm sóc không bị ảnh hưởng.
        </span>
      </span>
    </label>
  );
}
