"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ZaloSettings } from "@/lib/zalo/settings";
import { MasterOffNotice, numberChange, SaveButton, SwitchRow, useZaloSettings } from "./settings-kit";

export function CareSettings({ initial, tokenSet }: { initial: ZaloSettings; tokenSet: boolean }) {
  const { v, set, toggle, save, saving, off } = useZaloSettings(initial);

  return (
    <div className="flex flex-col gap-6">
      <MasterOffNotice enabled={v.enabled} tokenSet={tokenSet} />

      <Card>
        <CardHeader>
          <CardTitle>Kịch bản chăm sóc nhóm</CardTitle>
          <CardDescription>
            AI lên kịch bản đăng 2-3 lượt mỗi ngày cho từng nhóm (chữ, kèm ảnh, kèm video) theo insight nhóm, thời tiết và dịp lễ. Người dùng chỉnh rồi đăng ở mục{" "}
            <Link href="/zalo/care" className="underline">Kịch bản chăm sóc</Link>. Nhóm nào được chăm sóc và insight của nhóm thì nhập ở trang đó.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <SwitchRow checked={v.care} onChange={(c) => toggle("care", c)} disabled={off} title="Bật kịch bản chăm sóc nhóm" desc="Tắt thì trang Kịch bản chăm sóc đóng lại và AI không lên kịch bản nữa. Các bài đã lên vẫn được giữ." />
          <SwitchRow
            checked={v.careWeather}
            onChange={(c) => toggle("careWeather", c)}
            disabled={off || !v.care}
            title="Cho AI biết dự báo thời tiết"
            desc="Lấy dự báo 5 ngày từ Open-Meteo (miễn phí, chỉ gửi tọa độ địa điểm bên dưới) để bài hợp thời tiết: rét, mưa, nắng nóng."
          />
          <SwitchRow
            checked={v.careAutoRun}
            onChange={(c) => toggle("careAutoRun", c)}
            disabled={off || !v.care}
            title="Tự động lên kịch bản và đăng đúng giờ"
            desc="Chỉ chạy khi máy chủ (VPS) gọi /api/jobs/zalo-care định kỳ với ZALO_CARE_CRON_SECRET (xem README, mục Tự động đăng kịch bản chăm sóc). Máy cá nhân thì để tắt và bấm đăng bằng tay."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Địa điểm và thời gian lên kịch bản</CardTitle>
          <CardDescription>Địa điểm dùng để lấy dự báo thời tiết cho bài đăng. Gần nhà khách hàng của bạn nhất thì càng sát thực tế.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="careLocationName">Địa điểm (tên gọi)</Label>
              <Input id="careLocationName" value={v.careLocationName} onChange={(e) => set("careLocationName", e.target.value)} maxLength={100} className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="careLatitude">Vĩ độ</Label>
              <Input id="careLatitude" type="number" step="0.0001" value={v.careLatitude} onChange={numberChange(set, "careLatitude")} className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="careLongitude">Kinh độ</Label>
              <Input id="careLongitude" type="number" step="0.0001" value={v.careLongitude} onChange={numberChange(set, "careLongitude")} className="h-10" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Lấy vĩ độ, kinh độ: mở Google Maps, bấm chuột phải vào địa điểm, bấm dòng số đầu tiên để sao chép (ví dụ Hà Nội 21.0285, 105.8542).</p>
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="careHorizonDays">Lên kịch bản trước mấy ngày (1-3)</Label>
            <Input id="careHorizonDays" type="number" min={1} max={3} value={v.careHorizonDays} onChange={numberChange(set, "careHorizonDays")} className="h-10" />
          </div>
          <SaveButton onClick={() => save(["careLocationName", "careLatitude", "careLongitude", "careHorizonDays"])} saving={saving}>
            Lưu cài đặt chăm sóc
          </SaveButton>
        </CardContent>
      </Card>
    </div>
  );
}
