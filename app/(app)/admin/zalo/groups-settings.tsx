"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  buildPinCaption,
  dailyPollCalls,
  DEFAULT_PIN_FEED_CAPTION,
  PIN_FEED_INTERVAL_MAX_SEC,
  PIN_FEED_INTERVAL_MIN_SEC,
  PIN_FEED_PLACEHOLDERS,
  PINTEREST_TRIAL_DAILY_CALLS,
} from "@/lib/pinterest/feed";
import { buildCaption, CAPTION_PLACEHOLDERS, DEFAULT_CAPTION_TEMPLATE } from "@/lib/zalo/caption";
import type { ZaloSettings } from "@/lib/zalo/settings";
import { MasterOffNotice, numberChange, SaveButton, SwitchRow, useZaloSettings } from "./settings-kit";

const SAMPLE = {
  brandName: "Cà phê Đồng Xanh",
  customerName: "Anh Minh",
  label: "Ảnh 3 · Bảng tên bàn",
  saleName: "Lan",
  sessionUrl: "https://tên-miền/sessions/abc123",
};

const PIN_SAMPLE = { boardName: "Tem da khắc laser", title: "Tem da nâu khắc logo", description: "Mẫu tem da may viền cho túi xách", pinterestPinId: "123456789012345678" };

export function GroupsSettings({ initial, tokenSet }: { initial: ZaloSettings; tokenSet: boolean }) {
  const { v, set, toggle, save, saving, off } = useZaloSettings(initial);
  const preview = buildCaption(SAMPLE, v.captionTemplate);
  const previewNoLink = buildCaption({ ...SAMPLE, sessionUrl: undefined }, v.captionTemplate);
  const pinPreview = buildPinCaption(PIN_SAMPLE, v.pinFeedCaption);
  const pinPreviewBare = buildPinCaption({ ...PIN_SAMPLE, title: null, description: null }, v.pinFeedCaption);
  const pollCalls = v.pinFeedIntervalSec >= PIN_FEED_INTERVAL_MIN_SEC ? dailyPollCalls(v.pinFeedIntervalSec) : null;

  return (
    <div className="flex flex-col gap-6">
      <MasterOffNotice enabled={v.enabled} tokenSet={tokenSet} />

      <Card>
        <CardHeader>
          <CardTitle>Gửi ảnh mẫu vào nhóm</CardTitle>
<CardDescription>Ảnh mẫu không còn tự gửi vào nhóm khi tạo xong. Ảnh chỉ vào nhóm khi nhân viên tag bot giao việc (Trợ lý nhận lệnh) hoặc khi gửi tay từ Hộp thư.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <SwitchRow
            checked={v.groupSend}
            onChange={(c) => toggle("groupSend", c)}
            disabled={off}
            title="Cho phép gửi ảnh vào nhóm Zalo"
            desc="Tắt công tắc này là bot không gửi ảnh nào vào nhóm, kể cả khi nhân viên tag bot ra lệnh (kết quả vẫn xem được trên web)."
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="captionTemplate">Chữ đi kèm mỗi ảnh</Label>
            <Textarea id="captionTemplate" value={v.captionTemplate} onChange={(e) => set("captionTemplate", e.target.value)} rows={5} maxLength={1000} />
            <p className="text-xs text-muted-foreground">
              Gõ chỗ trống để hệ thống điền thông tin:{" "}
              {CAPTION_PLACEHOLDERS.map((p, i) => (
                <span key={p.key}>
                  <code className="rounded bg-muted px-1 py-0.5">{p.key}</code> {p.desc}
                  {i < CAPTION_PLACEHOLDERS.length - 1 ? "; " : "."}
                </span>
              ))}{" "}
              Dòng nào không có thông tin để điền (ví dụ dòng {"{link}"} khi web chưa có địa chỉ https công khai) sẽ tự bỏ.
            </p>
            <button type="button" className="self-start text-xs text-muted-foreground underline underline-offset-4" onClick={() => set("captionTemplate", DEFAULT_CAPTION_TEMPLATE)}>
              Dùng lại mẫu mặc định
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-3">
              <span className="text-xs font-medium text-muted-foreground">Xem trước (web có địa chỉ https)</span>
              <p className="text-sm whitespace-pre-line">{preview || "(trống)"}</p>
            </div>
            <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-3">
              <span className="text-xs font-medium text-muted-foreground">Xem trước (máy cá nhân, chưa có địa chỉ công khai)</span>
              <p className="text-sm whitespace-pre-line">{previewNoLink || "(trống)"}</p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="sendGapMs">Nghỉ giữa hai ảnh (mili giây)</Label>
            <Input id="sendGapMs" type="number" min={200} max={10000} step={100} value={v.sendGapMs} onChange={numberChange(set, "sendGapMs")} className="h-10" />
            <p className="text-xs text-muted-foreground">Ảnh gửi lần lượt từng tấm. Nghỉ lâu hơn thì chậm hơn nhưng ít bị Zalo giới hạn (lỗi 429). Gợi ý 600-1500.</p>
          </div>

          <SaveButton onClick={() => save(["captionTemplate", "sendGapMs"])} saving={saving}>
            Lưu cài đặt gửi ảnh
          </SaveButton>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mẫu Pinterest mới vào nhóm</CardTitle>
          <CardDescription>
            Mỗi khi bạn lưu thêm ảnh vào một board đang theo dõi trên Pinterest, bot gửi ngay ảnh đó vào các nhóm bật cột &quot;Nhận mẫu Pinterest&quot; ở bảng Nhóm Zalo
            bên dưới. Chọn board cần theo dõi ở{" "}
            <Link href="/admin/connections/pinterest" className="underline underline-offset-4">
              Hệ thống &gt; Kết nối &gt; Pinterest
            </Link>
            . Chức năng này chạy riêng, không phụ thuộc công tắc &quot;Cho phép gửi ảnh vào nhóm Zalo&quot; ở trên.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <SwitchRow
            checked={v.pinFeed}
            onChange={(c) => toggle("pinFeed", c)}
            disabled={off}
            title="Gửi mẫu Pinterest mới vào nhóm"
            desc="Tắt khi sắp lưu hàng loạt ảnh mà không muốn bot gửi. Bật lại thì bắt đầu theo dõi từ lúc bật: ảnh lưu trong lúc tắt không được gửi."
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pinFeedCaption">Chữ đi kèm mỗi mẫu</Label>
            <Textarea id="pinFeedCaption" value={v.pinFeedCaption} onChange={(e) => set("pinFeedCaption", e.target.value)} rows={3} maxLength={1000} />
            <p className="text-xs text-muted-foreground">
              Chỗ trống dùng được:{" "}
              {PIN_FEED_PLACEHOLDERS.map((p, i) => (
                <span key={p.key}>
                  <code className="rounded bg-muted px-1 py-0.5">{p.key}</code> {p.desc}
                  {i < PIN_FEED_PLACEHOLDERS.length - 1 ? "; " : "."}
                </span>
              ))}{" "}
              Dòng nào không có thông tin để điền sẽ tự bỏ. Để trống cả ô = chỉ gửi ảnh, không kèm chữ.
            </p>
            <button type="button" className="self-start text-xs text-muted-foreground underline underline-offset-4" onClick={() => set("pinFeedCaption", DEFAULT_PIN_FEED_CAPTION)}>
              Dùng lại mẫu mặc định
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-3">
              <span className="text-xs font-medium text-muted-foreground">Xem trước (pin có tiêu đề và mô tả)</span>
              <p className="text-sm wrap-break-word whitespace-pre-line">{pinPreview || "(chỉ gửi ảnh)"}</p>
            </div>
            <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-3">
              <span className="text-xs font-medium text-muted-foreground">Xem trước (pin không có tiêu đề, mô tả)</span>
              <p className="text-sm wrap-break-word whitespace-pre-line">{pinPreviewBare || "(chỉ gửi ảnh)"}</p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 sm:max-w-md">
            <Label htmlFor="pinFeedIntervalSec">Hỏi Pinterest mỗi (giây)</Label>
            <Input
              id="pinFeedIntervalSec"
              type="number"
              min={PIN_FEED_INTERVAL_MIN_SEC}
              max={PIN_FEED_INTERVAL_MAX_SEC}
              step={10}
              value={v.pinFeedIntervalSec}
              onChange={numberChange(set, "pinFeedIntervalSec")}
              className="h-10 sm:max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              Pinterest không tự báo khi có pin mới nên hệ thống phải hỏi định kỳ; số này gần bằng thời gian chờ lâu nhất giữa lúc lưu ảnh và lúc bot gửi.
              {pollCalls !== null && (
                <>
                  {" "}
                  Với số đang nhập, mỗi ngày hỏi khoảng {pollCalls.toLocaleString("vi-VN")} lượt.{" "}
                  {pollCalls > PINTEREST_TRIAL_DAILY_CALLS * 0.9 ? (
                    <span className="font-medium text-amber-700">
                      App Pinterest ở gói Trial chỉ được {PINTEREST_TRIAL_DAILY_CALLS.toLocaleString("vi-VN")} lượt gọi mỗi ngày (tính cả đồng bộ thư viện): chỉ đặt nhanh thế này khi app
                      đã lên gói Standard, nếu không Pinterest sẽ chặn giữa chừng.
                    </span>
                  ) : (
                    <>App Pinterest ở gói Trial được {PINTEREST_TRIAL_DAILY_CALLS.toLocaleString("vi-VN")} lượt gọi mỗi ngày (tính cả đồng bộ thư viện); gói Standard thì đặt 30-60 giây được.</>
                  )}
                </>
              )}
            </p>
          </div>

          <SaveButton onClick={() => save(["pinFeedCaption", "pinFeedIntervalSec"])} saving={saving}>
            Lưu cài đặt mẫu Pinterest
          </SaveButton>
        </CardContent>
      </Card>
    </div>
  );
}
