"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ASPECT_RATIOS, AUTO_MATERIAL_COUNTS, AUTO_SHEET_LAYOUT, QUALITY_TILE_CELLS, RESOLUTIONS, type Resolution } from "@/lib/image-options";
import { LABEL_POSITIONS, LABEL_POS_TEXT } from "@/lib/imaging/label-pos";
import { formatCostLabel } from "@/lib/pricing";
import { SELECTABLE_KIE_MODELS, kieModel } from "@/lib/providers/kie-models";
import type { Settings } from "@/lib/settings";
import { saveSettingsAction, type SettingsResult } from "./actions";

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction, pending] = useActionState<SettingsResult, FormData>(saveSettingsAction, {});
  const [modelId, setModelId] = useState(settings.imageModel);
  const [defaultResolution, setDefaultResolution] = useState<Resolution>(settings.defaultResolution);
  const [designResolution, setDesignResolution] = useState<Resolution>(settings.designResolution);
  const model = kieModel(modelId);
  const resolutions = model?.sizes.map((s) => s.resolution) ?? RESOLUTIONS;

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
  }, [state]);

  function onModelChange(id: string) {
    setModelId(id);
    const sizes = kieModel(id)?.sizes.map((s) => s.resolution) ?? RESOLUTIONS;
    setDefaultResolution((cur) => (sizes.includes(cur) ? cur : sizes[0]));
    setDesignResolution((cur) => (sizes.includes(cur) ? cur : sizes[0]));
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="imageModel">Model tạo ảnh</Label>
          <NativeSelect id="imageModel" name="imageModel" value={modelId} onChange={(e) => onModelChange(e.target.value)} className="sm:max-w-md">
            {SELECTABLE_KIE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {!m.verified ? " (chưa xác minh)" : ""}
              </option>
            ))}
          </NativeSelect>
          <div className="flex flex-col gap-1 rounded-lg bg-muted/30 p-3 text-sm">
            <p className="font-medium">Chi phí ước tính mỗi ảnh:</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              {model?.sizes.map((s) => (
                <li key={s.resolution}>
                  <span className="font-medium text-foreground">{s.resolution}</span>: {formatCostLabel({ credits: s.credits ?? 0, usd: (s.credits ?? 0) * 0.005, unknown: s.credits === null })}
                </li>
              ))}
            </ul>
            {model?.note && <p className="text-amber-700">{model.note}</p>}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="defaultResolution">Độ phân giải mặc định (khi tạo trang mẫu mới)</Label>
          <NativeSelect
            id="defaultResolution"
            name="defaultResolution"
            value={defaultResolution}
            onChange={(e) => setDefaultResolution(e.target.value as Resolution)}
          >
            {resolutions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="autoMaterialCount">Số chất liệu AI chọn cho mỗi logo</Label>
          <NativeSelect id="autoMaterialCount" name="autoMaterialCount" defaultValue={String(settings.autoMaterialCount)}>
            {AUTO_MATERIAL_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n} chất liệu ({Math.ceil(n / (AUTO_SHEET_LAYOUT.cols * AUTO_SHEET_LAYOUT.rows))} ảnh)
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            Khi tải logo mới hoặc bấm &quot;AI chọn chất liệu&quot;, AI đọc logo rồi chọn ngần này chất liệu hợp nhất để tạo ảnh mẫu, mỗi ảnh 8 chất liệu.
          </p>
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
          <p className="text-xs text-muted-foreground">Mỗi ảnh tạo hoặc tạo lại tính một lượt; ảnh tạo lỗi thì không tính, lượt được trả lại. Đặt 0 để tạm khóa. Admin không bị giới hạn.</p>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="flex items-start gap-2.5 rounded-lg border p-3 text-sm">
            <input type="checkbox" name="qualityDefault" defaultChecked={settings.qualityDefault} className="mt-0.5 size-4 accent-primary" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Mặc định bật &quot;Chất lượng cao&quot; khi tạo ảnh mẫu</span>
              <span className="text-xs text-muted-foreground">
                Ở chế độ này AI chỉ vẽ {QUALITY_TILE_CELLS} chất liệu mỗi lần rồi hệ thống ghép lại thành một ảnh 2 cột: logo to và nét hơn, kiểu khắc sát thực tế hơn, nhưng tốn gấp đôi token và gấp đôi lượt (ảnh 8 chất liệu
                tính 2 lượt). Nhân viên vẫn bật/tắt được cho từng lần tạo; mặc định này cũng áp dụng cho ảnh tạo tự động khi tải logo mới lên và khi nhân viên giao việc cho bot Zalo.
              </span>
            </span>
          </label>
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
          <NativeSelect
            id="designResolution"
            name="designResolution"
            value={designResolution}
            onChange={(e) => setDesignResolution(e.target.value as Resolution)}
          >
            {resolutions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">Độ phân giải thấp hơn tốn ít token hơn — xem bảng chi phí ở trên.</p>
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
