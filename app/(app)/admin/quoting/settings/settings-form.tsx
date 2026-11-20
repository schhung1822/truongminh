"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { LAST_SHEET_LABEL } from "@/lib/quoting/types";
import { cn } from "@/lib/utils";
import { saveQuoteSettingsAction } from "../actions";
import { groupDigits } from "../format";
import { NumberInput } from "../number-input";
import { checkTierRows, MAX_QUANTITIES, MAX_TIERS, parseQuantityList, uncoveredQuantities, type SettingsRaw, type TierRaw } from "../settings-input";

const POLICY_HELP: Record<"" | "WHOLE_SHEET" | "PRO_RATA", string> = {
  "": "Chưa chọn thì chưa báo giá được.",
  WHOLE_SHEET: "Phần lẻ của tấm cuối vẫn tính tiền cả tấm. Giá chắc ăn, hợp khi tấm lẻ khó dùng lại cho đơn khác.",
  PRO_RATA: "Tấm cuối chỉ tính theo phần đã dùng. Giá rẻ hơn khi đơn lẻ tấm, hợp khi xưởng dùng lại được phần tấm còn thừa.",
};

const EXAMPLE = "Ví dụ minh họa (không phải số của xưởng): một tấm xếp được 54 logo, khách đặt 100 cái thì cần 100 ÷ 54 ≈ 1,85 tấm. Tính cả tấm cuối: trả tiền 2 tấm. Tính theo phần dùng: trả tiền 1,85 tấm.";

const ENGRAVE_ROWS = [
  { key: "IT", label: "Khắc ít" },
  { key: "VUA", label: "Khắc vừa" },
  { key: "NHIEU", label: "Khắc nhiều" },
] as const;

export function SettingsForm({ initial, configVersion, updated }: { initial: SettingsRaw; configVersion: number; updated: string }) {
  const [v, setV] = useState<SettingsRaw>(initial);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ kind: "saved" | "error"; text: string } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [serverTierErrors, setServerTierErrors] = useState<(string | null)[] | null>(null);

  // sau khi lưu, máy chủ trả dữ liệu mới: nạp lại form
  const sig = JSON.stringify(initial);
  const [prevSig, setPrevSig] = useState(sig);
  if (sig !== prevSig) {
    setPrevSig(sig);
    setV(initial);
  }

  const tierCheck = useMemo(() => checkTierRows(v.tiers), [v.tiers]);
  const quantities = useMemo(() => parseQuantityList(v.quantities), [v.quantities]);
  const uncovered = useMemo(() => (tierCheck.ok && "values" in quantities ? uncoveredQuantities(quantities.values, tierCheck.tiers) : []), [tierCheck, quantities]);
  const tierErrors = serverTierErrors ?? tierCheck.rowErrors;
  const dirty = JSON.stringify(v) !== sig;

  function change(patch: Partial<SettingsRaw>) {
    setV((p) => ({ ...p, ...patch }));
    setStatus(null);
    setServerTierErrors(null);
  }
  function setTier(i: number, patch: Partial<TierRaw>) {
    change({ tiers: v.tiers.map((t, k) => (k === i ? { ...t, ...patch } : t)) });
  }
  function addTier() {
    // gợi ý "Từ SL" của dòng mới = "Đến SL" của dòng cuối + 1 (chỉ là gợi ý cho đỡ gõ, không phải giá trị mặc định của xưởng)
    const last = v.tiers[v.tiers.length - 1];
    const lastTo = last ? Number(last.toQty.replace(/\./g, "")) : NaN;
    change({ tiers: [...v.tiers, { fromQty: Number.isInteger(lastTo) && lastTo >= 1 ? String(lastTo + 1) : "", toQty: "", markupPct: "" }] });
  }
  function removeTier(i: number) {
    change({ tiers: v.tiers.filter((_, k) => k !== i) });
  }

  function save() {
    setShowErrors(true);
    start(async () => {
      const r = await saveQuoteSettingsAction(v);
      if (r.error) {
        setStatus({ kind: "error", text: r.error });
        setServerTierErrors(r.tierErrors ?? null);
      } else {
        setStatus({ kind: "saved", text: r.ok ?? "Đã lưu." });
        setServerTierErrors(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Phiên bản thông số hiện tại: <b className="text-foreground tabular-nums">{configVersion}</b>
        {updated ? ` · cập nhật gần nhất ${updated}` : " · chưa lưu lần nào"}. Lần đầu mọi ô đều trống; hệ thống không tự điền số nào thay xưởng.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Xếp logo và tính tiền tấm</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-gap">Khoảng cách mặc định giữa các logo</Label>
            <NumberInput id="s-gap" unit="mm" value={v.defaultGapMm} onChange={(x) => change({ defaultGapMm: x })} placeholder="Chưa có dữ liệu" className="h-10" />
            <p className="text-xs text-muted-foreground">Dùng cho chất liệu không có khoảng cách riêng (ở mục Tấm vật liệu). Có thể để trống nếu mọi chất liệu đã có khoảng cách riêng.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-round">Làm tròn đơn giá tới</Label>
            <NumberInput id="s-round" kind="money" unit="đồng" value={v.roundTo} onChange={(x) => change({ roundTo: x })} placeholder="Chưa có dữ liệu" className="h-10" />
            <p className="text-xs text-muted-foreground">Đơn giá bán được làm tròn tới bội số này. Phải là số nguyên đồng, từ 1 trở lên.</p>
          </div>

          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <Label htmlFor="s-policy">Chính sách tính tấm cuối</Label>
            <NativeSelect id="s-policy" value={v.lastSheetPolicy} onChange={(e) => change({ lastSheetPolicy: e.target.value as SettingsRaw["lastSheetPolicy"] })} className="sm:max-w-md">
              <option value="">Chưa chọn</option>
              <option value="WHOLE_SHEET">{LAST_SHEET_LABEL.WHOLE_SHEET}</option>
              <option value="PRO_RATA">{LAST_SHEET_LABEL.PRO_RATA}</option>
            </NativeSelect>
            <p className="text-sm">{POLICY_HELP[v.lastSheetPolicy]}</p>
            <p className="text-xs text-muted-foreground">{EXAMPLE}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mốc số lượng và mức khắc</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <Label htmlFor="s-qty">Các mốc số lượng hiển thị</Label>
            <Input id="s-qty" value={v.quantities} onChange={(e) => change({ quantities: e.target.value })} placeholder='Nhập kiểu "50, 100, 200, 500, 1000"' className="h-10 sm:max-w-xl" aria-invalid={"error" in quantities} />
            {"error" in quantities ? (
              <p className="text-sm text-red-700 dark:text-red-400">{quantities.error}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Ngăn cách bằng dấu phẩy. Mỗi mốc là một cột giá trong bảng báo giá (tối đa {MAX_QUANTITIES} mốc).
                {quantities.values.length > MAX_QUANTITIES && <span className="text-red-700 dark:text-red-400"> Đang nhập {quantities.values.length} mốc, vượt giới hạn.</span>}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 lg:col-span-2">
            <p className="text-sm font-medium">% diện tích logo được khắc, theo từng mức</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {ENGRAVE_ROWS.map((e) => (
                <div key={e.key} className="flex flex-col gap-1.5">
                  <Label htmlFor={`s-eng-${e.key}`}>{e.label}</Label>
                  <NumberInput id={`s-eng-${e.key}`} unit="% diện tích" value={v.engrave[e.key]} onChange={(x) => change({ engrave: { ...v.engrave, [e.key]: x } })} placeholder="Chưa có dữ liệu" className="h-10" />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Khi sale chọn mức khắc, hệ thống coi phần trăm này của diện tích logo là phần phải khắc (từ 0 đến 100). Mức &quot;Không khắc&quot; luôn là 0.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bảng bậc lãi theo số lượng</CardTitle>
          <CardDescription>
            Mỗi dòng là một khoảng số lượng. <b>Lãi cộng thêm trên giá vốn (%)</b>: giá bán = giá vốn × (1 + lãi ÷ 100). Ví dụ minh họa: giá vốn 100.000 đ, lãi 30% thì giá bán 130.000 đ. Đây không phải biên lợi nhuận tính trên giá bán. Các bậc phải liền nhau, không chồng, không hở; chỉ dòng cuối được để trống &quot;đến SL&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {v.tiers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có bậc nào. Thiếu bậc lãi thì chưa báo giá được.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="hidden grid-cols-[1fr_1fr_1.4fr_auto] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
                <span>Từ SL</span>
                <span>Đến SL (trống = không giới hạn)</span>
                <span>Lãi cộng thêm trên giá vốn (%)</span>
                <span className="w-9" />
              </div>
              {v.tiers.map((t, i) => {
                const err = showErrors || serverTierErrors ? tierErrors[i] : null;
                return (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
                      <NumberInput value={t.fromQty} onChange={(x) => setTier(i, { fromQty: x })} placeholder="Từ SL" aria-label={`Bậc ${i + 1}: từ số lượng`} aria-invalid={!!err} className="h-10" />
                      <NumberInput value={t.toQty} onChange={(x) => setTier(i, { toQty: x })} placeholder="Không giới hạn" aria-label={`Bậc ${i + 1}: đến số lượng (trống là không giới hạn)`} aria-invalid={!!err} className="h-10" />
                      <NumberInput unit="%" value={t.markupPct} onChange={(x) => setTier(i, { markupPct: x })} placeholder="Lãi cộng thêm" aria-label={`Bậc ${i + 1}: lãi cộng thêm trên giá vốn (%)`} aria-invalid={!!err} className="h-10" />
                      <Button type="button" variant="outline" size="icon" className="size-10 text-destructive" onClick={() => removeTier(i)} aria-label={`Xóa bậc ${i + 1}`}>
                        <Trash2Icon />
                      </Button>
                    </div>
                    {err && <p className="text-sm text-red-700 dark:text-red-400">Dòng {i + 1}: {err}</p>}
                  </div>
                );
              })}
            </div>
          )}
          <div>
            <Button type="button" variant="outline" onClick={addTier} disabled={v.tiers.length >= MAX_TIERS}>
              <PlusIcon /> Thêm bậc
            </Button>
          </div>
          {uncovered.length > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">Mốc số lượng chưa có bậc lãi nào phủ tới: {uncovered.map((q) => groupDigits(q)).join(", ")}. Sale sẽ không thấy giá ở các mốc này.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" className="h-10" onClick={save} disabled={pending || !dirty}>
          {pending && <Loader2Icon className="animate-spin" />}
          Lưu cấu hình giá
        </Button>
        {status && (
          <span role="status" className={cn("flex items-center gap-1 text-sm", status.kind === "saved" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
            {status.kind === "saved" && <CheckIcon className="size-4" />}
            {status.text}
          </span>
        )}
      </div>
    </div>
  );
}
