"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CalculatorIcon, CheckIcon, ChevronRightIcon, GitCompareArrowsIcon, Loader2Icon, RotateCwIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { BrandOption, CustomerOption, LogoOption } from "@/app/(app)/sessions/new/actions";
import type { QuoteResponse } from "@/lib/quoting/store";
import type { SizeSuggestion } from "@/lib/quoting/suggest";
import { ENGRAVE_LEVELS, ENGRAVE_LEVEL_LABEL, type EngraveLevel } from "@/lib/quoting/types";
import {
  calculateQuoteAction,
  compareMaterialsAction,
  probeLogoAction,
  saveQuoteAction,
  type CompareItem,
} from "./actions";
import { CompareTable } from "./compare-table";
import { cmFieldFromMm, cmToMm, fmtDec, parseDecimal, parseQuantityList } from "./format";
import { LogoPicker, type PickedLogo } from "./logo-picker";
import { MaterialMultiPicker, MaterialPicker, type MaterialOption } from "./material-picker";
import { QuoteList } from "./quote-list";
import { QuoteResultView, WarningBox } from "./quote-result";

type ResultState = {
  data: QuoteResponse;
  /** số lượng đã gửi lên khi có số lượng tùy chọn (null = dùng mốc chuẩn của xưởng) */
  quantities: number[] | null;
  signature: string;
  logoId: string;
  materialId: string;
  engrave: EngraveLevel;
  brandName: string;
  logoUrl: string;
};

export type QuoteToolProps = {
  customers: CustomerOption[];
  materials: MaterialOption[];
  initial: { customer: CustomerOption; brand: BrandOption; logo: LogoOption } | null;
  initialMaterialId: string | null;
  sessionId: string | null;
};

const MAX_COMPARE_OTHERS = 3;

/** Công cụ báo giá cho sale: chọn logo + chất liệu + kích thước, bấm Tính giá; xem bố cục, bảng giá, so sánh chất liệu, lưu báo giá. */
export function QuoteTool({ customers, materials, initial, initialMaterialId, sessionId }: QuoteToolProps) {
  const [logo, setLogo] = useState<PickedLogo | null>(initial ? { ...initial.logo, customer: initial.customer, brand: initial.brand } : null);
  const [picking, setPicking] = useState(!initial);
  const [materialId, setMaterialId] = useState(initialMaterialId ?? "");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [heightAuto, setHeightAuto] = useState(true);
  const [engrave, setEngrave] = useState<EngraveLevel>("KHONG_KHAC");
  const [qtyText, setQtyText] = useState("");
  const [withStandard, setWithStandard] = useState(true);
  const [probe, setProbe] = useState<{ logoId: string; ratio: number; warnings: string[] } | null>(null);

  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calcPending, startCalc] = useTransition();

  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compare, setCompare] = useState<{ items: CompareItem[]; primaryId: string } | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [comparePending, startCompare] = useTransition();

  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<{ id: string; signature: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savePending, startSave] = useTransition();
  const [listKey, setListKey] = useState(0);

  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  /* ---------- Giá trị dẫn xuất từ form ---------- */
  const logoId = logo?.id ?? null;
  const probeMaterialId = materials[0]?.id ?? null;

  // Lấy tỉ lệ khung bao thật của logo sớm để điền chiều cao khi sale gõ chiều rộng (không có con số giá nào được dùng)
  useEffect(() => {
    if (!logoId || !probeMaterialId) return;
    let cancelled = false;
    probeLogoAction(logoId, probeMaterialId).then((r) => {
      if (cancelled || "error" in r) return;
      setProbe({ logoId, ratio: r.ratio, warnings: r.warnings });
    });
    return () => {
      cancelled = true;
    };
  }, [logoId, probeMaterialId]);

  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  const widthNum = parseDecimal(widthCm);
  const widthMm = widthNum !== null && widthNum > 0 ? cmToMm(widthNum) : null;
  const ratio = probe && probe.logoId === logoId ? probe.ratio : result && result.logoId === logoId ? result.data.logo.ratio : null;
  const autoHeightText = ratio && widthMm ? cmFieldFromMm(widthMm / ratio) : "";
  const heightText = heightAuto ? autoHeightText : heightCm;
  const heightNum = heightAuto ? null : parseDecimal(heightCm);
  const heightMm = heightNum !== null && heightNum > 0 ? cmToMm(heightNum) : null;
  const qty = parseQuantityList(qtyText);
  const useStandard = qty.values.length > 0 && withStandard;
  const signature = JSON.stringify([logoId, materialId, widthMm, heightAuto ? null : heightMm, engrave, qty.values, useStandard]);
  const stale = !!result && result.signature !== signature;
  const probeWarnings = probe && probe.logoId === logoId ? probe.warnings : [];

  /** Kiểm tra đầu vào; trả về lời nhắc tiếng Việt nếu chưa đủ. */
  function validate(): string | null {
    if (!logo) return "Chọn logo trước.";
    if (!materialId) return "Chọn chất liệu.";
    if (widthMm === null) return "Nhập chiều rộng logo (cm) lớn hơn 0, ví dụ 5 hoặc 4,8.";
    if (!heightAuto && heightMm === null) return "Chiều cao logo phải là số lớn hơn 0. Xóa trống ô chiều cao để hệ thống tự tính theo tỉ lệ logo.";
    if (qty.error) return qty.error;
    return null;
  }

  function resetForLogo() {
    setResult(null);
    setError(null);
    setCompare(null);
    setCompareError(null);
    setSaved(null);
    setSaveError(null);
    setHeightAuto(true);
    setHeightCm("");
  }

  function pickLogo(l: PickedLogo) {
    setLogo(l);
    setPicking(false);
    resetForLogo();
  }

  function calculate() {
    const problem = validate();
    if (problem) return setError(problem);
    setError(null);
    const sig = signature;
    const used = { logoId: logo!.id, materialId, engrave, brandName: logo!.brand.name, logoUrl: logo!.url };
    startCalc(async () => {
      const r = await calculateQuoteAction({
        logoId: used.logoId,
        materialId: used.materialId,
        widthMm,
        heightMm: heightAuto ? null : heightMm,
        engraveLevel: used.engrave,
        quantities: qty.values.length > 0 ? qty.values : undefined,
        includeStandard: useStandard,
      });
      if ("error" in r) return setError(r.error);
      setResult({ data: r.data, quantities: r.quantities, signature: sig, logoId: used.logoId, materialId: used.materialId, engrave: used.engrave, brandName: used.brandName, logoUrl: used.logoUrl });
      setSaved(null);
      setSaveError(null);
    });
  }

  function applySuggestion(s: SizeSuggestion) {
    setWidthCm(cmFieldFromMm(s.widthMm));
    setHeightCm(cmFieldFromMm(s.heightMm));
    setHeightAuto(false);
    toast.success("Đã điền kích thước gợi ý. Bấm Tính giá để xem giá.");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function runCompare() {
    const problem = validate();
    if (problem) return setCompareError(problem);
    setCompareError(null);
    const quantities = qty.values.length > 0 ? (result && !stale && result.quantities ? result.quantities : qty.values) : undefined;
    startCompare(async () => {
      const r = await compareMaterialsAction({
        logoId: logo!.id,
        widthMm,
        heightMm: heightAuto ? null : heightMm,
        engraveLevel: engrave,
        quantities,
        materialIds: [materialId, ...compareIds],
      });
      if ("error" in r) return setCompareError(r.error);
      setCompare({ items: r.items, primaryId: materialId });
    });
  }

  function save() {
    if (!result || !result.data.view.ok || stale) return;
    setSaveError(null);
    const snapshot = result;
    startSave(async () => {
      const r = await saveQuoteAction({
        logoId: snapshot.logoId,
        materialId: snapshot.materialId,
        widthMm: snapshot.data.logo.widthMm,
        heightMm: snapshot.data.logo.heightMm,
        engraveLevel: snapshot.engrave,
        quantities: snapshot.quantities ?? undefined,
        sessionId,
        note: note.trim() || null,
      });
      if ("error" in r) return setSaveError(r.error);
      setSaved({ id: r.id, signature: snapshot.signature });
      setListKey((k) => k + 1);
      toast.success("Đã lưu báo giá.");
    });
  }

  const savedHere = !!result && saved?.signature === result.signature;
  const okResult = !!result && result.data.view.ok;
  const materialsEmpty = materials.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Thông tin báo giá</CardTitle>
          <CardDescription>Chọn logo, chất liệu và kích thước rồi bấm Tính giá. Giá do máy chủ tính, bạn chỉ cần nhập kích thước.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            ref={formRef}
            className="flex scroll-mt-4 flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              calculate();
            }}
          >
            {/* 1. Logo */}
            <section className="flex flex-col gap-2" aria-labelledby="q-logo">
              <h2 id="q-logo" className="text-sm font-semibold">
                1. Logo
              </h2>
              {picking || !logo ? (
                <LogoPicker
                  customers={customers}
                  initial={logo ? { customer: logo.customer, brand: logo.brand } : null}
                  onPick={pickLogo}
                  onCancel={logo ? () => setPicking(false) : undefined}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                  <span
                    className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
                    style={{
                      backgroundColor: "#fff",
                      backgroundImage:
                        "linear-gradient(45deg,#e5e5e5 25%,transparent 25%),linear-gradient(-45deg,#e5e5e5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e5e5 75%),linear-gradient(-45deg,transparent 75%,#e5e5e5 75%)",
                      backgroundSize: "16px 16px",
                      backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
                    }}
                  >
                    <img src={logo.url} alt="Logo đã chọn" className="max-h-full max-w-full object-contain" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{logo.brand.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{logo.customer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {logo.width}x{logo.height}px{logo.note ? ` · ${logo.note}` : ""}
                      {ratio ? ` · tỉ lệ rộng:cao của khung bao thật ${fmtDec(ratio, 2)}` : ""}
                    </p>
                  </div>
                  <Button type="button" variant="outline" className="h-9" onClick={() => setPicking(true)}>
                    Đổi logo
                  </Button>
                </div>
              )}
              {!picking && <WarningBox warnings={probeWarnings} />}
              {sessionId && (
                <p className="text-xs text-muted-foreground">
                  Báo giá sẽ được gắn với{" "}
                  <Link href={`/sessions/${sessionId}`} className="underline underline-offset-2">
                    phiên tư vấn này
                  </Link>
                  .
                </p>
              )}
            </section>

            {/* 2. Chất liệu */}
            <section className="flex flex-col gap-2 sm:max-w-xl" aria-labelledby="q-material">
              <h2 id="q-material" className="text-sm font-semibold">
                2. Chất liệu
              </h2>
              {materialsEmpty ? (
                <Alert>
                  <AlertDescription>Chưa có chất liệu nào đang bật. Nhờ quản trị viên bật chất liệu ở mục Quản trị.</AlertDescription>
                </Alert>
              ) : (
                <MaterialPicker materials={materials} value={materialId} onChange={setMaterialId} id="q-material-picker" />
              )}
            </section>

            {/* 3. Kích thước, mức khắc */}
            <section className="flex flex-col gap-3" aria-labelledby="q-size">
              <h2 id="q-size" className="text-sm font-semibold">
                3. Kích thước và mức khắc
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="q-width">Chiều rộng logo (cm)</Label>
                  <Input id="q-width" inputMode="decimal" autoComplete="off" placeholder="Ví dụ 5 hoặc 4,8" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} className="h-10" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="q-height">Chiều cao logo (cm)</Label>
                  <Input
                    id="q-height"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Tự tính theo tỉ lệ logo"
                    value={heightText}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v.trim() === "") {
                        setHeightAuto(true);
                        setHeightCm("");
                      } else {
                        setHeightAuto(false);
                        setHeightCm(v);
                      }
                    }}
                    className="h-10"
                  />
                  {heightAuto ? (
                    <p className="text-xs text-muted-foreground">{ratio ? "Tự tính theo tỉ lệ thật của logo. Có thể sửa." : "Sẽ tự tính theo tỉ lệ logo khi bấm Tính giá. Có thể sửa."}</p>
                  ) : (
                    <button type="button" onClick={() => setHeightAuto(true)} className="flex items-center gap-1 self-start text-xs text-primary underline underline-offset-2">
                      <RotateCwIcon className="size-3" /> Tự tính lại theo tỉ lệ logo
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="q-engrave">Mức khắc</Label>
                  <NativeSelect id="q-engrave" value={engrave} onChange={(e) => setEngrave(e.target.value as EngraveLevel)}>
                    {ENGRAVE_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {ENGRAVE_LEVEL_LABEL[l]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            </section>

            {/* 4. Số lượng */}
            <section className="flex flex-col gap-2 sm:max-w-xl" aria-labelledby="q-qty">
              <h2 id="q-qty" className="text-sm font-semibold">
                4. Mốc số lượng
              </h2>
              <p className="text-xs text-muted-foreground">Mặc định tính theo các mốc chuẩn của xưởng. Muốn xem thêm số lượng khác, nhập tối đa 6 số, cách nhau bằng dấu cách hoặc dấu phẩy.</p>
              <Input
                id="q-qty-input"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ví dụ 75, 300 (để trống = mốc chuẩn)"
                value={qtyText}
                onChange={(e) => setQtyText(e.target.value)}
                aria-label="Số lượng tùy chọn"
                aria-invalid={!!qty.error}
                className="h-10"
              />
              {qty.error && <p className="text-xs text-destructive">{qty.error}</p>}
              {qty.values.length > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={withStandard} onChange={(e) => setWithStandard(e.target.checked)} className="size-4" />
                  Tính cả các mốc chuẩn của xưởng (bỏ chọn để chỉ tính số lượng vừa nhập)
                </label>
              )}
            </section>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" className="h-11 px-6" disabled={calcPending || !logo || materialsEmpty}>
                {calcPending ? <Loader2Icon className="animate-spin" /> : <CalculatorIcon />}
                {calcPending ? "Đang tính..." : "Tính giá"}
              </Button>
              {!logo && <span className="text-sm text-muted-foreground">Chọn logo để bắt đầu.</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      {logo && (
        <Card>
          <CardHeader>
            <CardTitle>Báo giá đã lưu của logo này</CardTitle>
            <CardDescription>Bấm vào một báo giá để xem chi tiết hoặc đổi trạng thái.</CardDescription>
          </CardHeader>
          <CardContent>
            <QuoteList logoId={logo.id} refreshKey={listKey} />
          </CardContent>
        </Card>
      )}

      <div ref={resultRef} className="scroll-mt-4" aria-live="polite" aria-busy={calcPending}>
        {calcPending && !result && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Đang tính giá và xếp logo lên tấm...
          </p>
        )}
        {result && (
          <div className={calcPending ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <QuoteResultView data={result.data} brandName={result.brandName} logoUrl={result.logoUrl} stale={stale} onApplySuggestion={applySuggestion} />
          </div>
        )}
      </div>

      {logo && !materialsEmpty && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCompareArrowsIcon className="size-5" />
              So sánh chất liệu
            </CardTitle>
            <CardDescription>Cùng logo và kích thước, thử thêm 1 đến {MAX_COMPARE_OTHERS} chất liệu khác (tối đa {MAX_COMPARE_OTHERS + 1} chất liệu, tính cả chất liệu đang chọn ở trên).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!materialId ? (
              <p className="text-sm text-muted-foreground">Chọn chất liệu chính ở phần 2 trước.</p>
            ) : (
              <>
                <MaterialMultiPicker materials={materials} selected={compareIds} excludeId={materialId} max={MAX_COMPARE_OTHERS} onChange={setCompareIds} />
                <div>
                  <Button type="button" className="h-10" onClick={runCompare} disabled={comparePending || compareIds.length === 0}>
                    {comparePending ? <Loader2Icon className="animate-spin" /> : <GitCompareArrowsIcon />}
                    {comparePending ? "Đang so sánh..." : "So sánh"}
                  </Button>
                </div>
              </>
            )}
            {compareError && (
              <Alert variant="destructive">
                <AlertDescription>{compareError}</AlertDescription>
              </Alert>
            )}
            {compare && (
              <div className="flex flex-col gap-2">
                {compare.primaryId !== materialId && (
                  <p className="text-xs text-muted-foreground">Bảng dưới là kết quả của lần so sánh trước (chất liệu chính đã đổi sau đó).</p>
                )}
                <CompareTable items={compare.items} primaryId={compare.primaryId} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {okResult && (
        <Card>
          <CardHeader>
            <CardTitle>Lưu báo giá</CardTitle>
            <CardDescription>Máy chủ sẽ tính lại và lưu báo giá nháp đúng với kết quả đang xem. Lưu xong bạn có thể gửi khách và đổi trạng thái.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5 sm:max-w-xl">
              <Label htmlFor="q-note">Ghi chú (không bắt buộc)</Label>
              <Textarea id="q-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Ví dụ: khách cần gấp trước 20/11" disabled={savePending} />
            </div>
            {stale && <p className="text-sm text-muted-foreground">Bạn đã đổi thông số. Bấm Tính giá lại rồi mới lưu được.</p>}
            {saveError && (
              <Alert variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
            {savedHere && saved && (
              <Alert>
                <AlertDescription className="flex flex-wrap items-center gap-2">
                  <CheckIcon className="size-4 text-emerald-600" />
                  Đã lưu báo giá.
                  <Link href={`/quote/${saved.id}`} className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2">
                    Xem báo giá <ChevronRightIcon className="size-3.5" />
                  </Link>
                </AlertDescription>
              </Alert>
            )}
            <div>
              <Button type="button" className="h-10" onClick={save} disabled={savePending || stale || savedHere}>
                {savePending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
                {savePending ? "Đang lưu..." : savedHere ? "Đã lưu" : "Lưu báo giá"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
