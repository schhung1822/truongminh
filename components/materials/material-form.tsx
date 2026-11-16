"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type MaterialFormInitial = {
  id: string;
  code: string;
  name: string;
  groupName: string;
  printTech: string;
  descHuman: string;
  descAi: string;
  sortOrder: number;
  isActive: boolean;
  layer1Url: string | null;
  layer2Url: string | null;
  productPhotoUrl: string | null;
  referenceUrl: string | null;
};

function ImageField({
  name,
  label,
  hint,
  currentUrl,
  required,
}: {
  name: string;
  label: string;
  hint?: string;
  currentUrl?: string | null;
  required?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const shown = preview ?? currentUrl ?? null;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-start gap-3">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
          {shown ? (
            <img src={shown} alt={label} className="size-full object-contain" />
          ) : (
            <span className="px-2 text-center text-xs text-muted-foreground">Chưa có ảnh</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Input
            id={name}
            name={name}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            required={required && !currentUrl}
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
            className="h-10 pt-1.5"
          />
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

export function MaterialForm({
  initial,
  groups,
  techs,
}: {
  initial?: MaterialFormInitial;
  groups: string[];
  techs: string[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(initial?.isActive ?? true);
  const [removeProduct, setRemoveProduct] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("isActive", String(active));
      fd.set("removeProductPhoto", String(removeProduct));
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

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Mã chất liệu (duy nhất)</Label>
          <Input id="code" name="code" required maxLength={50} defaultValue={initial?.code} className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Tên gọi</Label>
          <Input id="name" name="name" required maxLength={100} defaultValue={initial?.name} className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="groupName">Nhóm (vải, nhựa...)</Label>
          <Input
            id="groupName"
            name="groupName"
            required
            maxLength={100}
            list="group-options"
            defaultValue={initial?.groupName}
            className="h-10"
          />
          <datalist id="group-options">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="printTech">Công nghệ in</Label>
          <Input
            id="printTech"
            name="printTech"
            required
            maxLength={100}
            list="tech-options"
            defaultValue={initial?.printTech}
            className="h-10"
          />
          <datalist id="tech-options">
            {techs.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="descHuman">Mô tả cho người đọc</Label>
          <Textarea id="descHuman" name="descHuman" rows={4} maxLength={2000} defaultValue={initial?.descHuman} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="descAi">Mô tả cho AI</Label>
          <Textarea id="descAi" name="descAi" rows={4} maxLength={2000} defaultValue={initial?.descAi} />
          <p className="text-xs text-muted-foreground">
            Viết bằng tiếng Anh sẽ tốt hơn: đặc điểm bề mặt, màu, độ bóng, cách logo hiện lên.
          </p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <ImageField
          name="layer1"
          label="Ảnh lớp 1"
          hint="PNG, JPG hoặc WEBP."
          currentUrl={initial?.layer1Url}
        />
        <ImageField name="layer2" label="Ảnh lớp 2" hint="Đặt cạnh lớp 1 thành một ảnh." currentUrl={initial?.layer2Url} />
        <div className="flex flex-col gap-2">
          <ImageField
            name="productPhoto"
            label="Ảnh sản phẩm thật (không bắt buộc)"
            currentUrl={removeProduct ? null : initial?.productPhotoUrl}
          />
          {initial?.productPhotoUrl && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={removeProduct}
                onChange={(e) => setRemoveProduct(e.target.checked)}
                className="size-4"
              />
              Xóa ảnh sản phẩm hiện tại
            </label>
          )}
        </div>
      </div>

      {initial?.referenceUrl && (
        <div className="flex flex-col gap-2">
          <Label>Ảnh tham chiếu gửi cho AI (tự ghép từ lớp 1 và lớp 2)</Label>
          <img src={initial.referenceUrl} alt="Ảnh tham chiếu" className="max-h-48 w-auto self-start rounded-lg border" />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sortOrder">Thứ tự hiển thị</Label>
          <Input
            id="sortOrder"
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={initial?.sortOrder ?? 0}
            className="h-10"
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4" />
          Đang bật (hiện trong danh sách chọn)
        </label>
      </div>

      <div className="flex gap-2">
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
