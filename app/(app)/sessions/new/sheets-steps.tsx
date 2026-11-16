"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ChevronRightIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createCatalogSessionAction } from "../actions";
import type { BrandOption, CustomerOption, LogoOption } from "./actions";

export type SheetOption = {
  id: string;
  name: string;
  groupName: string;
  cols: number;
  rows: number;
  aspectRatio: string;
  resolution: string;
  /** số chất liệu dùng được (đang bật và đã có ảnh tham chiếu) */
  usable: number;
  total: number;
};

export type QuotaInfo = { limit: number; used: number; left: number } | null;

/* ---------------- Bước 4: chọn trang mẫu ---------------- */

export function SheetsStep({
  sheets,
  selected,
  onChange,
  onNext,
}: {
  sheets: SheetOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  onNext: () => void;
}) {
  const [group, setGroup] = useState("");
  const groups = useMemo(() => [...new Set(sheets.map((s) => s.groupName).filter(Boolean))], [sheets]);
  const shown = group ? sheets.filter((s) => s.groupName === group) : sheets;
  const selectable = shown.filter((s) => s.usable > 0);
  const allShownSelected = selectable.length > 0 && selectable.every((s) => selected.has(s.id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function toggleAllShown() {
    const next = new Set(selected);
    for (const s of selectable) {
      if (allShownSelected) next.delete(s.id);
      else next.add(s.id);
    }
    onChange(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bước 4: Chọn trang mẫu</CardTitle>
        <CardDescription>
          Mỗi trang mẫu sẽ tạo thành một ảnh gồm nhiều chất liệu. Mặc định chọn tất cả, bạn có thể lọc theo nhóm.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sheets.length === 0 ? (
          <Alert>
            <AlertDescription>Chưa có trang mẫu nào đang bật. Hãy nhờ quản trị viên tạo trang mẫu trước.</AlertDescription>
          </Alert>
        ) : (
          <>
            {groups.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {["", ...groups].map((g) => (
                  <button
                    key={g || "all"}
                    type="button"
                    onClick={() => setGroup(g)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      group === g ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    {g || "Tất cả nhóm"}
                  </button>
                ))}
              </div>
            )}

            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown} className="size-4" />
              Chọn tất cả {group ? `nhóm "${group}"` : "trang"}
            </label>

            <ul className="flex flex-col gap-2">
              {shown.map((s) => {
                const disabled = s.usable === 0;
                return (
                  <li key={s.id}>
                    <label
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted",
                        selected.has(s.id) && "border-primary bg-primary/5",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={selected.has(s.id)}
                        disabled={disabled}
                        onChange={() => toggle(s.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.usable}/{s.total} chất liệu dùng được · {s.cols} x {s.rows} · {s.aspectRatio} · {s.resolution}
                        </p>
                      </div>
                      {s.groupName && <Badge variant="secondary">{s.groupName}</Badge>}
                      {disabled && <Badge variant="secondary">Chưa dùng được</Badge>}
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <Button type="button" className="h-11 self-start px-6" disabled={selected.size === 0} onClick={onNext}>
          Tiếp tục: xác nhận ({selected.size} trang)
          <ChevronRightIcon />
        </Button>
      </CardContent>
    </Card>
  );
}

/* ---------------- Bước 5: xác nhận ---------------- */

export function ConfirmStep({
  customer,
  brand,
  logo,
  sheets,
  quota,
  onBack,
}: {
  customer: CustomerOption;
  brand: BrandOption;
  logo: LogoOption;
  sheets: SheetOption[];
  quota: QuotaInfo;
  onBack: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const needed = sheets.length;
  const overQuota = quota !== null && needed > quota.left;

  function start() {
    setError(null);
    startTransition(async () => {
      const r = await createCatalogSessionAction(
        logo.id,
        sheets.map((s) => s.id),
      );
      if (r.error || !r.sessionId) return setError(r.error ?? "Không tạo được phiên.");
      toast.success("Đã bắt đầu tạo ảnh.");
      router.push(`/sessions/${r.sessionId}`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bước 5: Xác nhận</CardTitle>
        <CardDescription>Kiểm tra lại rồi bấm bắt đầu. Mỗi trang mẫu tạo một ảnh và tính một lượt.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-4 sm:flex-row">
          <div
            className="flex size-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
            style={{
              backgroundColor: "#fff",
              backgroundImage:
                "linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
            }}
          >
            <img src={logo.url} alt="Logo" className="max-h-full max-w-full object-contain" />
          </div>
          <dl className="grid flex-1 grid-cols-[auto_1fr] content-start gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Khách hàng</dt>
            <dd className="font-medium">{customer.name}</dd>
            <dt className="text-muted-foreground">Thương hiệu</dt>
            <dd className="font-medium">{brand.name}</dd>
            <dt className="text-muted-foreground">Logo</dt>
            <dd>
              {logo.width}x{logo.height}px
            </dd>
            <dt className="text-muted-foreground">Số trang mẫu</dt>
            <dd className="font-medium">{needed} (tạo {needed} ảnh)</dd>
            {quota && (
              <>
                <dt className="text-muted-foreground">Lượt hôm nay</dt>
                <dd>
                  Còn {quota.left}/{quota.limit}, sau khi tạo còn {Math.max(0, quota.left - needed)}
                </dd>
              </>
            )}
          </dl>
        </div>

        <ul className="flex flex-wrap gap-2">
          {sheets.map((s) => (
            <li key={s.id}>
              <Badge variant="secondary">{s.name}</Badge>
            </li>
          ))}
        </ul>

        {overQuota && (
          <Alert variant="destructive">
            <AlertDescription>
              Bạn còn {quota!.left} lượt nhưng cần {needed} lượt. Hãy quay lại chọn ít trang hơn.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" className="h-12 px-6 text-base" onClick={start} disabled={pending || overQuota}>
            {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            {pending ? "Đang bắt đầu..." : "Bắt đầu tạo ảnh"}
          </Button>
          <Button type="button" variant="outline" className="h-12" onClick={onBack} disabled={pending}>
            Quay lại
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
