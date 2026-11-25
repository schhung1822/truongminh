"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ImagePlusIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderTile, ImageTile, NewTile, PathBar, TileGrid } from "@/components/folder-ui";
import {
  listBrandsAction,
  listLogosAction,
  type BrandOption,
  type CustomerOption,
  type LogoOption,
} from "@/app/(app)/sessions/new/actions";
import { fold } from "./format";

export type PickedLogo = LogoOption & { customer: CustomerOption; brand: BrandOption };

/**
 * Chọn logo theo Khách hàng > Thương hiệu > Logo, kèm tải logo mới ngay trong thư mục thương hiệu đang mở
 * (không cần rời sang trang Khách hàng). Dùng lại các truy vấn của trang Khách hàng.
 * `initial` là khách + thương hiệu của logo đang chọn để mở sẵn đúng thư mục khi bấm "Đổi logo".
 */
export function LogoPicker({
  customers,
  initial,
  onPick,
  onCancel,
}: {
  customers: CustomerOption[];
  initial: { customer: CustomerOption; brand: BrandOption } | null;
  onPick: (logo: PickedLogo) => void;
  onCancel?: () => void;
}) {
  const [customer, setCustomer] = useState<CustomerOption | null>(initial?.customer ?? null);
  const [brand, setBrand] = useState<BrandOption | null>(initial?.brand ?? null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [logos, setLogos] = useState<LogoOption[]>([]);
  const [initialLoading, setInitialLoading] = useState(!!initial);
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState("");

  const initialBrandId = initial?.brand.id ?? null;
  useEffect(() => {
    if (!initialBrandId) return;
    let cancelled = false;
    listLogosAction(initialBrandId).then((r) => {
      if (cancelled) return;
      setLogos(r.logos ?? []);
      setInitialLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [initialBrandId]);

  const filtered = useMemo(() => {
    const tokens = fold(q).split(/\s+/).filter(Boolean);
    const list = tokens.length ? customers.filter((c) => tokens.every((t) => fold(`${c.name} ${c.phone ?? ""}`).includes(t))) : customers;
    return list.slice(0, 60);
  }, [customers, q]);

  function openRoot() {
    setCustomer(null);
    setBrand(null);
  }
  function openCustomer(c: CustomerOption) {
    setCustomer(c);
    setBrand(null);
    setBrands([]);
    startTransition(async () => setBrands((await listBrandsAction(c.id)).brands ?? []));
  }
  function openBrand(b: BrandOption) {
    setBrand(b);
    setLogos([]);
    setInitialLoading(false);
    startTransition(async () => setLogos((await listLogosAction(b.id)).logos ?? []));
  }

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file || !brand) return;
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("brandId", brand.id);
      fd.set("note", uploadNote);
      fd.set("file", file);
      const res = await fetch("/api/uploads/logo", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { error?: string; logo?: LogoOption; warning?: string | null };
      if (!res.ok || !body.logo) {
        setUploadError(body.error ?? "Không tải được logo. Vui lòng thử lại.");
        return;
      }
      if (body.warning) toast.warning(body.warning);
      setUploadNote("");
      setLogos((cur) => [body.logo!, ...cur]);
      toast.success("Đã tải logo lên.");
    } catch {
      setUploadError("Mất kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setUploading(false);
      input.value = "";
    }
  }

  const level = brand ? "logo" : customer ? "brand" : "customer";
  const loading = pending || (level === "logo" && initialLoading);
  const crumbs = [
    { label: "Khách hàng", onClick: customer ? openRoot : undefined },
    ...(customer ? [{ label: customer.name, onClick: brand ? () => openCustomer(customer) : undefined }] : []),
    ...(brand ? [{ label: brand.name }] : []),
  ];

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <PathBar crumbs={crumbs} />
        </div>
        {onCancel && (
          <Button type="button" variant="ghost" className="h-9" onClick={onCancel}>
            Giữ logo hiện tại
          </Button>
        )}
      </div>

      {level === "customer" && (
        <>
          <div className="relative sm:max-w-md">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} placeholder="Tìm khách theo tên hoặc số điện thoại/Zalo" className="h-10 pl-9" aria-label="Tìm khách hàng" />
          </div>
          <TileGrid>
            {filtered.map((c) => (
              <FolderTile key={c.id} name={c.name} subtitle={c.phone ? c.phone : `Sale: ${c.ownerName}`} count={c.brandCount} countLabel="thương hiệu" onClick={() => openCustomer(c)} />
            ))}
          </TileGrid>
          {customers.length === 0 && <p className="text-sm text-muted-foreground">Chưa có khách hàng nào. Tạo khách hàng và tải logo ở mục Khách hàng trước.</p>}
          {customers.length > 0 && filtered.length === 0 && <p className="text-sm text-muted-foreground">Không thấy khách nào khớp &quot;{q}&quot;.</p>}
        </>
      )}

      {level === "brand" && (
        <>
          {loading ? (
            <Skeletons />
          ) : (
            <TileGrid>
              {brands.map((b) => (
                <FolderTile key={b.id} name={b.name} count={b.logoCount} countLabel="logo" onClick={() => openBrand(b)} />
              ))}
            </TileGrid>
          )}
          {!loading && brands.length === 0 && <p className="text-sm text-muted-foreground">Khách này chưa có thương hiệu nào.</p>}
        </>
      )}

      {level === "logo" && (
        <>
          {uploadError && (
            <Alert variant="destructive">
              <AlertDescription>{uploadError}</AlertDescription>
            </Alert>
          )}
          {loading ? (
            <Skeletons />
          ) : (
            <TileGrid>
              {customer?.editable && (
                <NewTile label={uploading ? "Đang tải..." : "Tải logo mới"} icon={uploading ? <Loader2Icon className="animate-spin" /> : <ImagePlusIcon />}>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
                    onChange={uploadLogo}
                    disabled={uploading}
                    className="sr-only"
                    aria-label="File logo"
                  />
                </NewTile>
              )}
              {logos.map((l) => (
                <ImageTile
                  key={l.id}
                  src={l.url}
                  caption={`${l.width}x${l.height}px${l.note ? ` · ${l.note}` : ""}`}
                  selected={false}
                  onClick={() => onPick({ ...l, customer: customer!, brand: brand! })}
                />
              ))}
            </TileGrid>
          )}
          {!loading && logos.length === 0 && !customer?.editable && (
            <Alert>
              <AlertDescription>Thư mục này chưa có logo nào. Khách hàng này do người khác phụ trách nên bạn không tải logo được ở đây.</AlertDescription>
            </Alert>
          )}
          {customer?.editable && (
            <div className="flex flex-col gap-1.5 sm:max-w-sm">
              <Label htmlFor="q-logo-note">Ghi chú cho logo sắp tải lên (không bắt buộc)</Label>
              <Input id="q-logo-note" value={uploadNote} onChange={(e) => setUploadNote(e.target.value)} maxLength={1000} className="h-9" />
              <p className="text-xs text-muted-foreground">PNG, JPG, WEBP hoặc SVG, tối đa 15MB.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Skeletons() {
  return (
    <TileGrid>
      {[0, 1, 2, 3].map((i) => (
        <li key={i}>
          <Skeleton className="h-36 w-full rounded-xl" />
        </li>
      ))}
    </TileGrid>
  );
}
