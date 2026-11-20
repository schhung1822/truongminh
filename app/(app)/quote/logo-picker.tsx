"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { SearchIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderTile, ImageTile, PathBar, TileGrid } from "@/components/folder-ui";
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
 * Chọn logo theo Khách hàng > Thương hiệu > Logo (chỉ chọn, không tạo mới). Dùng lại các truy vấn của trang Khách hàng.
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
          {loading ? (
            <Skeletons />
          ) : (
            <TileGrid>
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
          {!loading && logos.length === 0 && (
            <Alert>
              <AlertDescription>Thư mục này chưa có logo nào. Tải logo lên ở mục Khách hàng rồi quay lại đây.</AlertDescription>
            </Alert>
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
