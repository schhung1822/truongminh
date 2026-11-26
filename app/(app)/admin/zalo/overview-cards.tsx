"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { clearOldMessagesAction, toggleZaloFeatureAction } from "./feature-actions";

/** Công tắc tổng: tắt thì không gửi, không nhận, không trả lời gì qua Zalo. */
export function MasterSwitch({ enabled, tokenSet }: { enabled: boolean; tokenSet: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();

  function change(value: boolean) {
    setOn(value);
    startTransition(async () => {
      const r = await toggleZaloFeatureAction("enabled", value);
      if (r.error) {
        setOn(!value);
        toast.error(r.error);
      } else toast.success(value ? "Đã bật Zalo." : "Đã tắt Zalo.");
    });
  }

  return (
    <Card>
      <CardContent>
        <label className="flex items-start gap-3">
          <Switch checked={on} onCheckedChange={change} disabled={!tokenSet || pending} className="mt-0.5" />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">Bật Zalo</span>
            <span className="text-sm text-muted-foreground">
              {tokenSet
                ? "Công tắc tổng cho mọi chức năng Zalo. Tắt là bot ngừng gửi ảnh, ngừng nhận tin và ngừng trả lời; cấu hình vẫn được giữ nguyên."
                : "Chưa kết nối bot Zalo nào nên chưa bật được. Thêm bot ở Hệ thống > Kết nối > Zalo."}
            </span>
          </span>
        </label>
      </CardContent>
    </Card>
  );
}

/** Dọn các tin nhắn Zalo đã lưu (nội dung hội thoại bot dùng làm ngữ cảnh) để bảng không phình mãi. */
export function CleanupCard({ messages }: { messages: number }) {
  const [days, setDays] = useState(90);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dọn dữ liệu</CardTitle>
        <CardDescription>
          Hiện đang lưu {messages.toLocaleString("vi-VN")} tin nhắn hội thoại (lưu khi bật Hộp thư hoặc Trợ lý nhận lệnh). Xóa tin cũ không ảnh hưởng ảnh đã gửi nhóm,
          kịch bản chăm sóc hay danh sách nhân viên.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cleanup-days">Xóa tin cũ hơn (ngày)</Label>
          <Input id="cleanup-days" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-10 w-32" />
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Xóa mọi tin nhắn Zalo cũ hơn ${days} ngày? Không khôi phục được.`)) return;
            startTransition(async () => {
              const r = await clearOldMessagesAction(days);
              if (r.error) toast.error(r.error);
              else toast.success(r.ok ?? "Đã xóa.");
            });
          }}
        >
          {pending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />} Xóa tin cũ
        </Button>
      </CardContent>
    </Card>
  );
}
