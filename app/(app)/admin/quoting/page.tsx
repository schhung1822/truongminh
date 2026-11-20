import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/dal";
import { loadQuotingData } from "./data";
import { formatDateTime } from "./format";
import { configChecks, MATERIAL_MISSING_CODES, MATERIAL_MISSING_SHORT } from "./status";
import { MachineStateBadge, StateIcon } from "./status-bits";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tình trạng thông số báo giá" };

const MISSING_LONG: Record<string, string> = {
  stockWidthMm: "Chưa có rộng tấm",
  stockHeightMm: "Chưa có cao tấm",
  stockPrice: "Chưa có giá tấm",
  edgeMarginMm: "Chưa có lề tấm",
  gapMm: "Chưa có khoảng cách giữa logo (và cũng chưa có mặc định chung)",
  technique: "Chưa có công nghệ (để tìm thông số máy)",
};

function GoLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
      {children} <ArrowRightIcon className="size-3.5" />
    </Link>
  );
}

export default async function QuotingOverviewPage() {
  await requireAdmin();
  const data = await loadQuotingData();
  const { rows, techniques, config } = data;

  const withoutGap = rows.filter((r) => r.gapMm === null).length;
  const checks = configChecks(config, withoutGap);
  const configMissing = checks.filter((c) => c.state === "missing").length;

  const used = techniques.filter((t) => t.activeMaterials > 0);
  const machineBad = used.filter((t) => t.state === "none" || t.state === "missing").length;
  const machinePartial = used.filter((t) => t.state === "partial").length;

  const stockComplete = rows.filter((r) => r.missing.length === 0).length;
  const stockMissingRows = rows.length - stockComplete;
  const missCount = (code: string) => rows.filter((r) => r.missing.includes(code)).length;

  const blocked = rows.length === 0 || configMissing > 0 || machineBad > 0 || stockMissingRows > 0;
  const level: "ok" | "warn" | "missing" = blocked ? "missing" : machinePartial > 0 ? "warn" : "ok";
  const headline =
    rows.length === 0
      ? "Chưa có chất liệu nào đang bật nên chưa có gì để báo giá."
      : level === "ok"
        ? "Đã đủ thông số để báo giá cho mọi chất liệu đang bật."
        : level === "warn"
          ? "Báo giá được kiểu chỉ cắt; báo giá có khắc còn thiếu tốc độ khắc của máy."
          : "Chưa đủ thông số: chất liệu nào còn thiếu thì công cụ báo giá chưa ra giá.";

  return (
    <div className="flex flex-col gap-6">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4",
          level === "ok" && "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
          level === "warn" && "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
          level === "missing" && "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40",
        )}
      >
        <p className="flex items-center gap-2 font-medium">
          <StateIcon state={level} className="size-5" />
          {headline}
        </p>
        <p className="text-sm text-muted-foreground">
          Phiên bản thông số: <b className="text-foreground tabular-nums">{data.configVersion}</b>
          {" · "}
          {data.updatedAt ? <>cập nhật gần nhất {formatDateTime(data.updatedAt)}</> : "chưa có thay đổi nào được lưu"}
        </p>
      </div>
      {data.truncated && <p className="text-sm text-amber-700 dark:text-amber-400">Có hơn {rows.length} chất liệu đang bật; chỉ kiểm tra {rows.length} chất liệu đầu tiên.</p>}

      <Card>
        <CardHeader>
          <CardTitle>1. Cấu hình chung</CardTitle>
          <CardDescription>
            {configMissing === 0 ? "Đã đủ." : `Còn ${configMissing} mục chưa có.`} <GoLink href="/admin/quoting/settings">Mở Cấu hình giá</GoLink>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {checks.map((c) => (
              <li key={c.code} className="flex items-start gap-3 py-2">
                <StateIcon state={c.state} className="mt-0.5" />
                <div className="flex flex-col sm:flex-row sm:gap-3">
                  <span className="text-sm font-medium">{c.label}</span>
                  <span className={cn("text-sm", c.state === "ok" ? "text-muted-foreground" : "text-red-700 dark:text-red-400")}>{c.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Thông số máy của các công nghệ đang dùng</CardTitle>
          <CardDescription>
            Chỉ tính công nghệ có chất liệu đang bật. <GoLink href="/admin/quoting/machines">Mở Thông số máy</GoLink>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {used.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có chất liệu đang bật nào có công nghệ. Gán công nghệ cho chất liệu ở Chất liệu &gt; Phân loại.</p>
          ) : (
            <ul className="divide-y">
              {used.map((t) => (
                <li key={t.value} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {t.label} <span className="font-normal text-muted-foreground">({t.activeMaterials} chất liệu đang bật)</span>
                    </span>
                    {t.state !== "ok" && (
                      <span className="text-xs text-muted-foreground">
                        {t.state === "none" ? "Chưa có dòng thông số máy nào cho công nghệ này." : `Thiếu: ${t.missingLabels.join(", ")}.`}
                      </span>
                    )}
                  </div>
                  <MachineStateBadge state={t.state} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Thông số tấm của các chất liệu đang bật</CardTitle>
          <CardDescription>
            {rows.length === 0 ? "Chưa có chất liệu đang bật." : `${stockComplete}/${rows.length} chất liệu đã đủ thông số tấm.`}{" "}
            <GoLink href="/admin/quoting/materials">Mở Tấm vật liệu</GoLink>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {MATERIAL_MISSING_CODES.every((c) => missCount(c) === 0) ? (
            <p className="text-sm text-muted-foreground">Không có chất liệu nào còn thiếu thông số tấm.</p>
          ) : (
            <ul className="divide-y">
              {MATERIAL_MISSING_CODES.filter((c) => missCount(c) > 0).map((c) => (
                <li key={c} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <StateIcon state="missing" />
                    {MISSING_LONG[c] ?? `Thiếu ${MATERIAL_MISSING_SHORT[c]}`}: <b className="tabular-nums">{missCount(c)}</b> chất liệu
                  </span>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <GoLink href={`/admin/quoting/materials?miss=${c}`}>Xem các chất liệu này</GoLink>
                    {c === "technique" && <GoLink href="/admin/materials">Gán công nghệ ở Chất liệu</GoLink>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
