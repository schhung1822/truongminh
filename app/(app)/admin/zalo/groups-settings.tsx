"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export function GroupsSettings({ initial, tokenSet }: { initial: ZaloSettings; tokenSet: boolean }) {
  const { v, set, toggle, save, saving, off } = useZaloSettings(initial);
  const preview = buildCaption(SAMPLE, v.captionTemplate);
  const previewNoLink = buildCaption({ ...SAMPLE, sessionUrl: undefined }, v.captionTemplate);

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
    </div>
  );
}
