"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { ZaloSettings } from "@/lib/zalo/settings";
import { saveZaloSettingsAction, toggleZaloFeatureAction } from "./feature-actions";

export type BoolKey = {
  [K in keyof ZaloSettings]: ZaloSettings[K] extends boolean ? K : never;
}[keyof ZaloSettings];

/**
 * Trạng thái cấu hình cho một trang cài đặt Zalo. Công tắc lưu ngay khi gạt; các ô nhập lưu khi bấm nút lưu của từng khối
 * (chỉ gửi các mục của khối đó, không đè lên mục ở trang khác).
 */
export function useZaloSettings(initial: ZaloSettings) {
  const [v, setV] = useState(initial);
  const [toggling, startToggle] = useTransition();
  const [saving, startSave] = useTransition();

  function set<K extends keyof ZaloSettings>(key: K, value: ZaloSettings[K]) {
    setV((p) => ({ ...p, [key]: value }));
  }

  function toggle(key: BoolKey, value: boolean) {
    setV((p) => ({ ...p, [key]: value }));
    startToggle(async () => {
      const r = await toggleZaloFeatureAction(key, value);
      if (r.error) {
        setV((p) => ({ ...p, [key]: !value }));
        toast.error(r.error);
      }
    });
  }

  function save(keys: (keyof ZaloSettings)[]) {
    startSave(async () => {
      const patch = Object.fromEntries(keys.map((k) => [k, v[k]])) as Partial<ZaloSettings>;
      const r = await saveZaloSettingsAction(patch);
      if (r.error) toast.error(r.error);
      else toast.success(r.ok ?? "Đã lưu.");
    });
  }

  return { v, set, toggle, save, toggling, saving, off: !v.enabled };
}

/** Một hàng công tắc: tên, mô tả ngắn, tự lưu khi gạt. */
export function SwitchRow({
  checked,
  onChange,
  title,
  desc,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  desc: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? "opacity-50" : ""}`}>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{desc}</span>
      </span>
    </label>
  );
}

export function SaveButton({ onClick, saving, children }: { onClick: () => void; saving: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Button type="button" className="h-10" onClick={onClick} disabled={saving}>
        {saving && <Loader2Icon className="animate-spin" />}
        {children}
      </Button>
    </div>
  );
}

/** Ô số: giữ chuỗi gõ dở (ví dụ ô trống) rồi mới đổi sang số. */
export function numberChange<K extends keyof ZaloSettings>(set: (key: K, value: ZaloSettings[K]) => void, key: K) {
  return (e: React.ChangeEvent<HTMLInputElement>) => set(key, Number(e.target.value) as ZaloSettings[K]);
}

/** Dải thông báo khi công tắc tổng đang tắt (các công tắc bên dưới mờ đi và không bấm được). */
export function MasterOffNotice({ enabled, tokenSet }: { enabled: boolean; tokenSet: boolean }) {
  if (enabled && tokenSet) return null;
  return (
    <p className="rounded-lg border border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
      {tokenSet
        ? "Zalo đang tắt (công tắc tổng ở mục Tổng quan). Các chức năng bên dưới sẽ chưa chạy cho tới khi bật."
        : "Chưa kết nối bot Zalo nào nên Zalo chưa chạy. Thêm bot ở Hệ thống > Kết nối > Zalo."}
    </p>
  );
}
