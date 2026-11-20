"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { PROFILE_FIELDS, VISIBILITIES, VISIBILITY_LABEL, type Visibility } from "@/lib/knowledge/roles";
import { cn } from "@/lib/utils";
import { saveProfileAction } from "./actions";

const LEVEL_TEXT: Record<Visibility, string> = {
  PUBLIC: "Công khai: mọi AI (kể cả soạn nháp cho khách) được dùng",
  INTERNAL: "Nội bộ: chỉ trợ lý cho sale đọc",
  ADMIN_ONLY: "Chỉ admin: không AI nào đọc",
};

const SELECT_TONE: Record<Visibility, string> = {
  PUBLIC: "border-emerald-400",
  INTERNAL: "border-amber-400",
  ADMIN_ONLY: "border-red-500 text-red-700 dark:text-red-400",
};

export function ProfileForm({
  workshopName: initialName,
  values: initialValues,
  visibility: initialVisibility,
  updated,
}: {
  workshopName: string;
  values: Record<string, string>;
  visibility: Record<string, Visibility>;
  updated: string | null;
}) {
  const [workshopName, setWorkshopName] = useState(initialName);
  const [values, setValues] = useState(initialValues);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [saving, start] = useTransition();

  function save() {
    start(async () => {
      const r = await saveProfileAction({ workshopName, fields: values, visibility });
      if (r.error) toast.error(r.error);
      else toast.success(r.ok ?? "Đã lưu.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hồ sơ doanh nghiệp</CardTitle>
        <CardDescription>
          Mỗi trường có một mức hiển thị. AI chỉ đọc trường đúng mức của vai đó; trường trống thì AI không nhắc tới. Chưa chọn mức thì xem là Nội bộ.
          {updated && <> Lưu lần cuối: {updated}.</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5 sm:max-w-xl">
          <Label htmlFor="workshopName">Tên xưởng</Label>
          <Input id="workshopName" value={workshopName} onChange={(e) => setWorkshopName(e.target.value)} maxLength={100} className="h-10" />
          <p className="text-xs text-muted-foreground">Dùng chung với chân ảnh (Cấu hình hệ thống). Đổi ở đây là đổi ở đó. Luôn được AI biết.</p>
        </div>

        {PROFILE_FIELDS.map((f) => {
          const level = visibility[f.key];
          return (
            <div key={f.key} className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_16rem]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`f-${f.key}`}>{f.label}</Label>
                {f.multiline ? (
                  <Textarea id={`f-${f.key}`} value={values[f.key]} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))} rows={3} maxLength={5000} />
                ) : (
                  <Input id={`f-${f.key}`} value={values[f.key]} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))} maxLength={300} className="h-10" />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`v-${f.key}`} className="text-xs text-muted-foreground">
                  Mức hiển thị
                </Label>
                <NativeSelect
                  id={`v-${f.key}`}
                  value={level}
                  onChange={(e) => setVisibility((p) => ({ ...p, [f.key]: e.target.value as Visibility }))}
                  className={cn("border-2", SELECT_TONE[level])}
                >
                  {VISIBILITIES.map((v) => (
                    <option key={v} value={v}>
                      {VISIBILITY_LABEL[v]}
                    </option>
                  ))}
                </NativeSelect>
                <p className={cn("text-xs", level === "ADMIN_ONLY" ? "font-medium text-red-600" : "text-muted-foreground")}>{LEVEL_TEXT[level]}</p>
              </div>
            </div>
          );
        })}

        <div>
          <Button type="button" className="h-10" onClick={save} disabled={saving}>
            {saving && <Loader2Icon className="animate-spin" />}
            Lưu hồ sơ
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
