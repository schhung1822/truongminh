import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { MIN_SAMPLES } from "@/lib/quoting/calibration";
import { calibrationFor } from "@/lib/quoting/store";
import { CALIBRATION_KEYS, roundSuggestion } from "../calibration-form";
import { loadTechniqueChoices } from "../data";
import { CalibrationPanel, type CalibrationRowData } from "./calibration-panel";

export const metadata: Metadata = { title: "Hiệu chỉnh thông số máy" };

type Params = { technique?: string };

export default async function QuotingCalibrationPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const technique = (params.technique ?? "").trim().slice(0, 60);

  const [choices, counts] = await Promise.all([loadTechniqueChoices(), db.machineTimeLog.groupBy({ by: ["technique"], _count: { _all: true } })]);
  const countBy = new Map(counts.map((c) => [c.technique, c._count._all]));
  const chosen = technique ? choices.find((c) => c.value === technique) : undefined;

  const view = technique ? await calibrationFor(technique) : null;
  const rows: CalibrationRowData[] = view
    ? CALIBRATION_KEYS.map((key) => {
        const s = view.result.suggested[key];
        return { key, current: view.current?.[key] ?? null, suggested: s === null || s === undefined ? null : roundSuggestion(s) };
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        So thời gian máy thực tế của các đơn đã ghi với thông số đang dùng, rồi đề xuất cài đặt, đổi tấm, tốc độ cắt, tốc độ khắc sát thực tế hơn. Đề xuất chỉ là gợi ý: <b>chỉ áp dụng khi bạn bấm</b>.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Chọn công nghệ</CardTitle>
          <CardDescription>Mỗi công nghệ hiệu chỉnh riêng, cần ít nhất {MIN_SAMPLES} đơn đã ghi.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex flex-wrap items-center gap-2">
            <NativeSelect name="technique" defaultValue={technique} aria-label="Công nghệ cần hiệu chỉnh" className="w-72">
              <option value="">Chọn công nghệ</option>
              {choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label} ({countBy.get(c.value) ?? 0} đơn đã ghi)
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" className="h-10">
              Xem đề xuất
            </Button>
          </form>
        </CardContent>
      </Card>

      {view && (
        <Card>
          <CardContent>
            <CalibrationPanel
              technique={technique}
              techniqueLabel={chosen?.label ?? technique}
              n={view.result.n}
              minSamples={MIN_SAMPLES}
              r2={view.result.r2}
              warnings={view.result.warnings}
              rows={rows}
              hasProfile={view.current !== null}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
