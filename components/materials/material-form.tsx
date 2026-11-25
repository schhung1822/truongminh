"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeftRightIcon, CropIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CONFIDENCE_LEVELS, PHOTO_ISSUES, type OptionRow, type OptionType } from "@/lib/materials/option-types";
import { parseThickness, THICKNESS_CLASSES, thicknessClass } from "@/lib/materials/thickness";
import { cn } from "@/lib/utils";
import { ImageEditorDialog } from "./image-editor-dialog";

export type MaterialFormInitial = {
  id: string;
  code: string;
  name: string;
  descHuman: string;
  thicknessMm: number | null;
  sortOrder: number;
  isActive: boolean;
  layer1Url: string | null;
  layer2Url: string | null;
  referenceUrl: string | null;
  baseMaterial: string | null;
  technique: string | null;
  surfaceFinish: string | null;
  surfacePattern: string | null;
  colorCount: string | null;
  frontColorName: string | null;
  frontColorFamily: string | null;
  frontColorConfidence: string | null;
  backColorName: string | null;
  backColorFamily: string | null;
  backColorConfidence: string | null;
  seriesCode: string | null;
  aiVisualNote: string | null;
  photoIssue: string | null;
  classifyConfidence: string | null;
  needsReview: boolean;
  reviewNote: string | null;
  styleTags: string[];
};

type Slot = { file: File | null; preview: string | null };
const EMPTY: Slot = { file: null, preview: null };

/** Ô chọn từ danh mục: chỉ chọn, không gõ tự do. Giá trị hiện có nhưng đã bị tắt vẫn hiện để không mất. */
function OptionSelect({
  id,
  name,
  label,
  type,
  options,
  defaultValue,
  required,
  emptyLabel = "Chưa chọn",
}: {
  id: string;
  name: string;
  label: string;
  type: OptionType;
  options: OptionRow[];
  defaultValue?: string | null;
  required?: boolean;
  emptyLabel?: string;
}) {
  const list = options.filter((o) => o.type === type && (o.isActive || o.value === defaultValue));
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <NativeSelect id={id} name={name} required={required} defaultValue={defaultValue ?? ""}>
        <option value="">{required ? "Chọn..." : emptyLabel}</option>
        {list.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.isActive ? "" : " (đã tắt)"}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

function ConfidenceSelect({ id, name, label, defaultValue }: { id: string; name: string; label: string; defaultValue?: string | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} name={name} defaultValue={defaultValue ?? ""}>
        <option value="">Chưa đánh giá</option>
        {CONFIDENCE_LEVELS.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

function CheckChips({ name, items, checked }: { name: string; items: { value: string; label: string }[]; checked: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <label key={it.value} className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm has-checked:border-primary has-checked:bg-primary/10">
          <input type="checkbox" name={name} value={it.value} defaultChecked={checked.includes(it.value)} className="size-3.5" />
          {it.label}
        </label>
      ))}
    </div>
  );
}

function ImagePicker({
  label,
  hint,
  shown,
  fileName,
  onPick,
  onEdit,
}: {
  label: string;
  hint: string;
  shown: string | null;
  fileName: string | null;
  onPick: (file: File | null) => void;
  /** có nếu slot đang giữ một file vừa chọn trong phiên này: mở lại hộp xoay/cắt mà không cần chọn lại file */
  onEdit?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex size-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
          {shown ? (
            <img src={shown} alt={label} className="size-full object-contain" />
          ) : (
            <span className="px-2 text-center text-xs text-muted-foreground">Chưa có ảnh</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <input
            ref={ref}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-label={label}
            onChange={(e) => {
              onPick(e.target.files?.[0] ?? null);
              e.target.value = ""; // chọn lại đúng file cũ vẫn nhận
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => ref.current?.click()}>
              {shown ? "Chọn ảnh khác" : "Chọn ảnh"}
            </Button>
            {onEdit && (
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={onEdit}>
                <CropIcon /> Xoay/cắt
              </Button>
            )}
          </div>
          {fileName && <p className="truncate text-xs text-muted-foreground">Ảnh mới: {fileName}</p>}
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>
  );
}

export function MaterialForm({
  initial,
  options,
  stockSlot,
}: {
  initial?: MaterialFormInitial;
  options: OptionRow[];
  /** Mục "Tấm vật liệu" (form riêng, nút lưu riêng) hiện thành tab "Giá & tấm" — chỉ có ở trang sửa, trang thêm mới không truyền. */
  stockSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(initial?.isActive ?? true);
  const [needsReview, setNeedsReview] = useState(initial?.needsReview ?? false);
  const [thickness, setThickness] = useState(initial?.thicknessMm != null ? String(initial.thicknessMm) : "");

  // Hai ảnh nằm trong state (không dựa vào ô chọn file) để đổi chỗ được mà không phải chọn lại.
  const [slots, setSlots] = useState<[Slot, Slot]>([EMPTY, EMPTY]);
  const [swapped, setSwapped] = useState(false); // ảnh ĐÃ LƯU đang bị đổi chỗ
  const [editing, setEditing] = useState<{ slot: 0 | 1; file: File } | null>(null);
  const slotsRef = useRef(slots);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);
  useEffect(
    () => () => {
      for (const s of slotsRef.current) if (s.preview) URL.revokeObjectURL(s.preview);
    },
    [],
  );

  const stored = swapped ? [initial?.layer2Url ?? null, initial?.layer1Url ?? null] : [initial?.layer1Url ?? null, initial?.layer2Url ?? null];
  const shown = [slots[0].preview ?? stored[0], slots[1].preview ?? stored[1]];
  const hasStoredImages = !!(initial?.layer1Url || initial?.layer2Url);
  const canSwap = !!(shown[0] || shown[1]);
  const imagesChanged = swapped || !!slots[0].file || !!slots[1].file;

  /** Chọn file mới ở một ô: mở hộp xoay/cắt trước, chỉ áp dụng vào ô sau khi bấm "Dùng ảnh này". */
  function pick(i: 0 | 1, file: File | null) {
    if (!file) return;
    setEditing({ slot: i, file });
  }

  function applyEdited(file: File) {
    if (!editing) return;
    const i = editing.slot;
    setSlots((prev) => {
      const next: [Slot, Slot] = [prev[0], prev[1]];
      if (next[i].preview) URL.revokeObjectURL(next[i].preview!);
      next[i] = { file, preview: URL.createObjectURL(file) };
      return next;
    });
    setEditing(null);
  }

  function swap() {
    setSlots((prev) => [prev[1], prev[0]]);
    if (hasStoredImages) setSwapped((v) => !v);
  }

  const parsedThickness = parseThickness(thickness);
  const cls = typeof parsedThickness === "number" ? thicknessClass(parsedThickness) : null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (parsedThickness === undefined) {
      setError("Độ dày phải là số, ví dụ 0.5 hoặc 0,8 (mm).");
      return;
    }
    if (!initial && (!slots[0].file || !slots[1].file)) {
      setError("Cần cả ảnh mặt trước và ảnh mặt sau.");
      return;
    }
    setPending(true);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("isActive", String(active));
      fd.set("needsReview", String(needsReview));
      if (slots[0].file) fd.set("layer1", slots[0].file);
      if (slots[1].file) fd.set("layer2", slots[1].file);
      if (initial && swapped) fd.set("swapLayers", "true");
      const res = await fetch(initial ? `/api/admin/materials/${initial.id}` : "/api/admin/materials", {
        method: "POST",
        body: fd,
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Không lưu được. Vui lòng thử lại.");
        return;
      }
      toast.success(initial ? "Đã lưu chất liệu." : "Đã thêm chất liệu.");
      router.push("/admin/materials");
      router.refresh();
    } catch {
      setError("Mất kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  }

  const styleItems = options.filter((o) => o.type === "STYLE_TAG" && (o.isActive || initial?.styleTags.includes(o.value))).map((o) => ({ value: o.value, label: o.label }));
  const photoChecked = (initial?.photoIssue ?? "").split("|").filter(Boolean);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* báo cho máy chủ biết form này gửi đủ mọi trường phân loại (ô trống = xóa) */}
      <input type="hidden" name="classifyForm" value="1" />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <Tabs defaultValue="info">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger type="button" value="info">
                Thông tin chung
              </TabsTrigger>
              <TabsTrigger type="button" value="images">
                Ảnh mẫu
              </TabsTrigger>
              <TabsTrigger type="button" value="classify">
                Phân loại &amp; mô tả
              </TabsTrigger>
              <TabsTrigger type="button" value="qa">
                Kiểm tra chất lượng
              </TabsTrigger>
              {stockSlot && (
                <TabsTrigger type="button" value="stock">
                  Giá &amp; tấm
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="info" keepMounted className="flex flex-col gap-5 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="code">Mã chất liệu (duy nhất)</Label>
                  <Input id="code" name="code" required maxLength={50} defaultValue={initial?.code} className="h-10" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="name">Tên gọi</Label>
                  <Input id="name" name="name" required maxLength={100} defaultValue={initial?.name} className="h-10" />
                </div>
                <OptionSelect id="baseMaterial" name="baseMaterial" label="Nhóm chất liệu" type="BASE_MATERIAL" options={options} defaultValue={initial?.baseMaterial} required />
                <OptionSelect id="technique" name="technique" label="Công nghệ in" type="TECHNIQUE" options={options} defaultValue={initial?.technique} required />
                <OptionSelect id="seriesCode" name="seriesCode" label="Dòng nhà cung cấp" type="SERIES" options={options} defaultValue={initial?.seriesCode} emptyLabel="Không có" />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sortOrder">Thứ tự hiển thị</Label>
                  <Input id="sortOrder" name="sortOrder" type="number" min={0} defaultValue={initial?.sortOrder ?? 0} className="h-10" />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1.5 sm:max-w-xs">
                  <Label htmlFor="thicknessMm">Độ dày (mm)</Label>
                  <Input
                    id="thicknessMm"
                    name="thicknessMm"
                    inputMode="decimal"
                    placeholder="Ví dụ 0.5"
                    value={thickness}
                    onChange={(e) => setThickness(e.target.value)}
                    aria-invalid={parsedThickness === undefined}
                    className="h-10"
                  />
                </div>
                {parsedThickness === undefined ? (
                  <p className="text-sm text-destructive">Độ dày phải là số, ví dụ 0.5 hoặc 0,8.</p>
                ) : cls ? (
                  <p className="text-sm">
                    <span className="font-medium">{cls.label}.</span> {cls.rule}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Không bắt buộc. Nhập số đo thật, hệ thống tự xếp vào nhóm Mỏng, Cao thành hoặc Dày.</p>
                )}
                <ul className="grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-3">
                  {THICKNESS_CLASSES.map((c) => (
                    <li key={c.key} className={cn("rounded-lg border px-2.5 py-1.5", cls?.key === c.key && "border-primary bg-primary/5 text-foreground")}>
                      <span className="font-medium">{c.label}</span> ({c.range}): {c.rule}
                    </li>
                  ))}
                </ul>
              </div>

              <label className="flex w-fit items-center gap-2.5 text-sm">
                <Switch id="isActive" checked={active} onCheckedChange={setActive} />
                Đang bật (hiện trong danh sách chọn)
              </label>
            </TabsContent>

            <TabsContent value="images" keepMounted className="flex flex-col gap-4 pt-4">
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <ImagePicker
                  label="Ảnh MẶT TRƯỚC (làm mặt logo)"
                  hint="PNG, JPG hoặc WEBP. Hiện bên TRÁI trong ảnh tham chiếu."
                  shown={shown[0]}
                  fileName={slots[0].file?.name ?? null}
                  onPick={(f) => pick(0, f)}
                  onEdit={slots[0].file ? () => setEditing({ slot: 0, file: slots[0].file! }) : undefined}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-fit self-center lg:mt-12"
                  onClick={swap}
                  disabled={!canSwap}
                  title="Đổi chỗ ảnh mặt trước và mặt sau"
                >
                  <ArrowLeftRightIcon /> Đổi chỗ
                </Button>
                <ImagePicker
                  label="Ảnh MẶT SAU (làm viền logo)"
                  hint="Hiện bên PHẢI trong ảnh tham chiếu."
                  shown={shown[1]}
                  fileName={slots[1].file?.name ?? null}
                  onPick={(f) => pick(1, f)}
                  onEdit={slots[1].file ? () => setEditing({ slot: 1, file: slots[1].file! }) : undefined}
                />
              </div>
              {swapped && <p className="text-xs text-muted-foreground">Đã đổi chỗ hai ảnh đã lưu. Bấm &quot;Lưu chất liệu&quot; để áp dụng.</p>}
              {initial?.referenceUrl && (
                <div className="flex flex-col gap-2">
                  <Label>Ảnh tham chiếu gửi cho AI (tự ghép từ mặt trước và mặt sau)</Label>
                  {imagesChanged ? (
                    <p className="text-sm text-muted-foreground">Ảnh tham chiếu sẽ được ghép lại khi bạn lưu.</p>
                  ) : (
                    <img src={initial.referenceUrl} alt="Ảnh tham chiếu" className="max-h-48 w-auto self-start rounded-lg border" />
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="classify" keepMounted className="flex flex-col gap-5 pt-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <OptionSelect id="surfaceFinish" name="surfaceFinish" label="Chất bề mặt" type="SURFACE_FINISH" options={options} defaultValue={initial?.surfaceFinish} />
                <OptionSelect id="surfacePattern" name="surfacePattern" label="Họa tiết" type="SURFACE_PATTERN" options={options} defaultValue={initial?.surfacePattern} />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="colorCount">Số màu</Label>
                  <NativeSelect id="colorCount" name="colorCount" defaultValue={initial?.colorCount ?? ""}>
                    <option value="">Chưa chọn</option>
                    <option value="ONE">1 màu (hai mặt cùng màu)</option>
                    <option value="TWO">2 màu (hai mặt khác màu)</option>
                  </NativeSelect>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-3 rounded-lg bg-muted/30 p-3">
                  <p className="text-sm font-medium">Mặt trước</p>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="frontColorName">Tên màu (tả đúng cái nhìn thấy)</Label>
                    <Input id="frontColorName" name="frontColorName" maxLength={100} defaultValue={initial?.frontColorName ?? ""} className="h-10" />
                  </div>
                  <OptionSelect id="frontColorFamily" name="frontColorFamily" label="Họ màu" type="COLOR_FAMILY" options={options} defaultValue={initial?.frontColorFamily} />
                  <ConfidenceSelect id="frontColorConfidence" name="frontColorConfidence" label="Độ chắc chắn của màu" defaultValue={initial?.frontColorConfidence} />
                </div>
                <div className="flex flex-col gap-3 rounded-lg bg-muted/30 p-3">
                  <p className="text-sm font-medium">Mặt sau</p>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="backColorName">Tên màu (tả đúng cái nhìn thấy)</Label>
                    <Input id="backColorName" name="backColorName" maxLength={100} defaultValue={initial?.backColorName ?? ""} className="h-10" />
                  </div>
                  <OptionSelect id="backColorFamily" name="backColorFamily" label="Họ màu" type="COLOR_FAMILY" options={options} defaultValue={initial?.backColorFamily} />
                  <ConfidenceSelect id="backColorConfidence" name="backColorConfidence" label="Độ chắc chắn của màu" defaultValue={initial?.backColorConfidence} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Phong cách hợp với (chọn nhiều)</Label>
                <CheckChips name="styleTags" items={styleItems} checked={initial?.styleTags ?? []} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="descHuman">Mô tả cho sale (tiếng Việt, 1-2 câu: trông thế nào, hợp logo nào)</Label>
                <Textarea id="descHuman" name="descHuman" rows={3} maxLength={2000} defaultValue={initial?.descHuman} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="aiVisualNote">Mô tả bề mặt cho AI (1 câu tiếng Anh, chỉ tả cái nhìn thấy)</Label>
                <Textarea id="aiVisualNote" name="aiVisualNote" rows={2} maxLength={1000} defaultValue={initial?.aiVisualNote ?? ""} />
                <p className="text-xs text-muted-foreground">Lưu để dùng sau; hiện chưa đưa vào prompt tạo ảnh.</p>
              </div>
            </TabsContent>

            <TabsContent value="qa" keepMounted className="flex flex-col gap-4 pt-4">
              <p className="text-xs text-muted-foreground">Dành cho người rà soát: đánh dấu mẫu cần xem lại hoặc cần chụp lại ảnh.</p>
              <div className="flex flex-col gap-1.5">
                <Label>Vấn đề của ảnh mẫu</Label>
                <CheckChips name="photoIssue" items={PHOTO_ISSUES.map((p) => ({ value: p.value, label: p.label }))} checked={photoChecked} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ConfidenceSelect id="classifyConfidence" name="classifyConfidence" label="Độ tin cậy của phân loại" defaultValue={initial?.classifyConfidence} />
                <label className="flex items-center gap-2.5 self-end pb-2 text-sm">
                  <Switch id="needsReview" checked={needsReview} onCheckedChange={setNeedsReview} />
                  Cần xem lại
                </label>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reviewNote">Ghi chú xem lại</Label>
                <Textarea id="reviewNote" name="reviewNote" rows={2} maxLength={2000} defaultValue={initial?.reviewNote ?? ""} />
              </div>
            </TabsContent>

            {stockSlot && (
              <TabsContent value="stock" keepMounted className="pt-4">
                {stockSlot}
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      <ImageEditorDialog file={editing?.file ?? null} onConfirm={applyEdited} onCancel={() => setEditing(null)} />

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-0 sm:rounded-xl sm:border sm:px-4">
        <Button type="submit" className="h-10 px-5" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          {pending ? "Đang lưu..." : "Lưu chất liệu"}
        </Button>
        <Button type="button" variant="outline" className="h-10" onClick={() => router.back()} disabled={pending}>
          Hủy
        </Button>
      </div>
    </form>
  );
}
