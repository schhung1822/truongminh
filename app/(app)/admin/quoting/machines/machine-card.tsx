"use client";

import { useState, useTransition } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveMachineProfileAction } from "../actions";
import type { TechniqueInfo } from "../data";
import { formatDateTime } from "../format";
import { MACHINE_FIELDS, machineToRaw, sameMachineRaw, type MachineRaw } from "../machine-form";
import { NumberInput } from "../number-input";
import { MachineStateBadge } from "../status-bits";

/** Thẻ thông số máy của MỘT công nghệ: mỗi ô có đơn vị và gợi ý nghĩa, ô trống là "Chưa có dữ liệu". */
export function MachineCard({ tech }: { tech: TechniqueInfo }) {
  const baseline = machineToRaw(tech.values);
  const sig = JSON.stringify(baseline);
  const [draft, setDraft] = useState<MachineRaw>(baseline);
  const [prevSig, setPrevSig] = useState(sig);
  const [status, setStatus] = useState<{ kind: "saved" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  // dữ liệu thật vừa đổi (đã lưu, hoặc vừa Áp dụng ở mục Hiệu chỉnh): nạp lại ô nhập
  if (sig !== prevSig) {
    setPrevSig(sig);
    setDraft(baseline);
  }
  const dirty = !sameMachineRaw(draft, baseline);

  function save() {
    start(async () => {
      const r = await saveMachineProfileAction(tech.value, draft);
      setStatus(r.error ? { kind: "error", text: r.error } : { kind: "saved", text: r.ok ?? "Đã lưu." });
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">{tech.label}</CardTitle>
          <MachineStateBadge state={tech.state} />
        </div>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            {tech.activeMaterials > 0 ? `${tech.activeMaterials} chất liệu đang bật dùng công nghệ này` : "Chưa có chất liệu đang bật nào dùng công nghệ này"}
          </span>
          {!tech.inCatalog && <Badge variant="outline">Không còn trong danh mục công nghệ</Badge>}
          {tech.inCatalog && !tech.catalogActive && <Badge variant="outline">Đã tắt trong danh mục</Badge>}
          {tech.profileUpdatedAt && <span>Cập nhật {formatDateTime(tech.profileUpdatedAt)}</span>}
        </CardDescription>
        {tech.state !== "ok" && (
          <p className={cn("text-sm", tech.state === "partial" ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400")}>
            {tech.state === "none" ? "Chưa có dòng thông số máy nào. Nhập các ô bên dưới rồi bấm Lưu." : `Còn thiếu: ${tech.missingLabels.join(", ")}.`}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
          {MACHINE_FIELDS.map((f) => {
            const id = `m-${tech.value}-${f.key}`;
            return (
              <div key={f.key} className="flex flex-col gap-1.5">
                <Label htmlFor={id}>
                  {f.label}
                  {f.optional && <span className="font-normal text-muted-foreground">(tùy chọn)</span>}
                </Label>
                <NumberInput
                  id={id}
                  kind={f.kind}
                  unit={f.unit}
                  value={draft[f.key]}
                  onChange={(v) => {
                    setDraft((d) => ({ ...d, [f.key]: v }));
                    setStatus(null);
                  }}
                  placeholder="Chưa có dữ liệu"
                  className="h-10"
                  aria-describedby={`${id}-hint`}
                />
                <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                  {f.hint}
                </p>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" className="h-10" onClick={save} disabled={!dirty || pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Lưu thông số máy
          </Button>
          {status && (
            <span role="status" className={cn("flex items-center gap-1 text-sm", status.kind === "saved" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
              {status.kind === "saved" && <CheckIcon className="size-4" />}
              {status.text}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
