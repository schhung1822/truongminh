"use client";

import { useActionState, useEffect } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ASPECT_RATIOS, RESOLUTIONS } from "@/lib/image-options";
import { LABEL_POSITIONS, LABEL_POS_TEXT } from "@/lib/imaging/label-pos";
import type { Settings } from "@/lib/settings";
import { saveSettingsAction, type SettingsResult } from "./actions";

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction, pending] = useActionState<SettingsResult, FormData>(saveSettingsAction, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="imageModel">Model tạo ảnh</Label>
          <Input id="imageModel" name="imageModel" defaultValue={settings.imageModel} required maxLength={100} className="h-10" />
          <p className="text-xs text-muted-foreground">Tên model của kie.ai, gpt-image-2-5-sunburst-image-to-image hoặc gpt-image-2-5-flare-image-to-image (cùng giá).</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="defaultResolution">Độ phân giải mặc định (khi tạo trang mẫu mới)</Label>
          <NativeSelect id="defaultResolution" name="defaultResolution" defaultValue={settings.defaultResolution}>
            {RESOLUTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dailyLimitPerSale">Giới hạn lượt tạo ảnh mỗi sale mỗi ngày</Label>
          <Input
            id="dailyLimitPerSale"
            name="dailyLimitPerSale"
            type="number"
            min={0}
            defaultValue={settings.dailyLimitPerSale}
            required
            className="h-10"
          />
          <p className="text-xs text-muted-foreground">Mỗi ảnh tạo hoặc tạo lại tính một lượt. Đặt 0 để tạm khóa. Admin không bị giới hạn.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="labelMode">Cách ghi nhãn chất liệu trên ảnh</Label>
          <NativeSelect id="labelMode" name="labelMode" defaultValue={settings.labelMode}>
            <option value="overlay">Thẻ đầy đủ: ghi &quot;mã - tên&quot; ngay trên từng ô</option>
            <option value="compact">Thẻ gọn: thẻ hẹp, tên xuống dòng (ít che logo)</option>
            <option value="legend">Đánh số trên ô và có bảng chú giải bên dưới</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="labelPos">Vị trí nhãn chất liệu mặc định</Label>
          <NativeSelect id="labelPos" name="labelPos" defaultValue={settings.labelPos}>
            {LABEL_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {LABEL_POS_TEXT[p]}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            Áp dụng cho ảnh mới khi dùng thẻ đầy đủ hoặc thẻ gọn. Mỗi ảnh vẫn chỉnh lại kiểu và vị trí được sau khi tạo, ngay ở trang kết quả.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="designAspectRatio">Tỉ lệ ảnh thiết kế (bước 2)</Label>
          <NativeSelect id="designAspectRatio" name="designAspectRatio" defaultValue={settings.designAspectRatio}>
            {ASPECT_RATIOS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="designResolution">Độ phân giải ảnh thiết kế</Label>
          <NativeSelect id="designResolution" name="designResolution" defaultValue={settings.designResolution}>
            {RESOLUTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">1K tiết kiệm token hơn (6 so với 10 token mỗi ảnh ở 2K).</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workshopName">Tên xưởng (một dòng chữ nhỏ ở chân ảnh)</Label>
          <Input id="workshopName" name="workshopName" defaultValue={settings.workshopName} maxLength={100} className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="footerDisclaimer">Dòng ghi chú dưới tên xưởng ở chân ảnh (để trống nếu không cần)</Label>
          <Input id="footerDisclaimer" name="footerDisclaimer" defaultValue={settings.footerDisclaimer} maxLength={100} className="h-10" />
          <p className="text-xs text-muted-foreground">Mặc định &quot;Hình minh họa&quot;. Ảnh đã tạo trước đó cần bấm &quot;Vẽ lại khung và nhãn&quot; để có dòng này.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="footerNote">Dòng chú thích thêm dưới ảnh (để trống nếu không cần)</Label>
          <Input id="footerNote" name="footerNote" defaultValue={settings.footerNote} maxLength={200} className="h-10" />
        </div>
      </div>
      <Button type="submit" className="h-10 self-start px-5" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Lưu cấu hình
      </Button>
    </form>
  );
}
