"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ChevronRightIcon,
  CheckIcon,
  FolderPlusIcon,
  ImagePlusIcon,
  Loader2Icon,
  SearchIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderTile, ImageTile, NewTile, PathBar, TileGrid } from "@/components/folder-ui";
import { cn } from "@/lib/utils";
import { ConfirmStep, SheetsStep, type QuotaInfo, type SheetOption } from "./sheets-steps";
import {
  createBrandAction,
  createCustomerAction,
  listBrandsAction,
  listLogosAction,
  type BrandOption,
  type CustomerOption,
  type LogoOption,
} from "./actions";

export type WizardInitial = { customer: CustomerOption; brand: BrandOption; logo: LogoOption };
type Step = "browse" | "sheets" | "confirm";

const STEP_LABELS: { key: Step; label: string }[] = [
  { key: "browse", label: "Chọn logo" },
  { key: "sheets", label: "Trang mẫu" },
  { key: "confirm", label: "Xác nhận" },
];

export function NewSessionWizard({
  customers: initialCustomers,
  initial,
  sheets,
  quota,
}: {
  customers: CustomerOption[];
  initial: WizardInitial | null;
  sheets: SheetOption[];
  quota: QuotaInfo;
}) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [customer, setCustomer] = useState<CustomerOption | null>(initial?.customer ?? null);
  const [brand, setBrand] = useState<BrandOption | null>(initial?.brand ?? null);
  const [logo, setLogo] = useState<LogoOption | null>(initial?.logo ?? null);
  const [step, setStep] = useState<Step>(initial ? "sheets" : "browse");
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [logos, setLogos] = useState<LogoOption[]>([]);
  const [loading, startLoading] = useTransition();
  // mặc định chọn tất cả trang mẫu dùng được
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(
    () => new Set(sheets.filter((x) => x.usable > 0).map((x) => x.id)),
  );

  const stepIndex = STEP_LABELS.findIndex((s) => s.key === step);

  function openRoot() {
    setCustomer(null);
    setBrand(null);
    setLogo(null);
  }

  function openCustomer(c: CustomerOption) {
    setCustomer(c);
    setBrand(null);
    setLogo(null);
    startLoading(async () => setBrands((await listBrandsAction(c.id)).brands ?? []));
  }

  function openBrand(b: BrandOption) {
    setBrand(b);
    setLogo(null);
    startLoading(async () => setLogos((await listLogosAction(b.id)).logos ?? []));
  }

  /** Quay lại màn hình duyệt thư mục (giữ nguyên chỗ đang đứng, nạp lại danh sách). */
  function backToBrowse() {
    setStep("browse");
    if (brand) startLoading(async () => setLogos((await listLogosAction(brand.id)).logos ?? []));
    else if (customer) startLoading(async () => setBrands((await listBrandsAction(customer.id)).brands ?? []));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tiến trình */}
      <ol className="flex flex-wrap gap-2 text-sm">
        {STEP_LABELS.map((s, i) => {
          const done = i < stepIndex;
          return (
            <li key={s.key}>
              <button
                type="button"
                disabled={!done}
                onClick={() => (s.key === "browse" ? backToBrowse() : setStep(s.key))}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors",
                  i === stepIndex && "border-primary bg-primary text-primary-foreground",
                  done && "bg-muted hover:bg-muted/70",
                  !done && i !== stepIndex && "text-muted-foreground",
                )}
              >
                {done ? <CheckIcon className="size-3.5" /> : <span className="font-semibold">{i + 1}</span>}
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      {step === "browse" && (
        <Explorer
          customers={customers}
          customer={customer}
          brand={brand}
          brands={brands}
          logos={logos}
          loading={loading}
          selectedLogo={logo}
          onOpenRoot={openRoot}
          onOpenCustomer={openCustomer}
          onOpenBrand={openBrand}
          onCustomerCreated={(c) => {
            setCustomers((prev) => [c, ...prev]);
            openCustomer(c);
          }}
          onBrandCreated={(b) => {
            setBrands((prev) => [b, ...prev]);
            openBrand(b);
          }}
          onSelectLogo={setLogo}
          onLogoUploaded={(l) => {
            setLogos((prev) => [l, ...prev]);
            setLogo(l);
          }}
          onNext={() => setStep("sheets")}
        />
      )}

      {step === "sheets" && (
        <SheetsStep
          sheets={sheets}
          selected={selectedSheets}
          onChange={setSelectedSheets}
          onNext={() => setStep("confirm")}
        />
      )}

      {step === "confirm" && customer && brand && logo && (
        <ConfirmStep
          customer={customer}
          brand={brand}
          logo={logo}
          sheets={sheets.filter((x) => selectedSheets.has(x.id))}
          quota={quota}
          onBack={() => setStep("sheets")}
        />
      )}
    </div>
  );
}

/* ============ Duyệt thư mục: Khách hàng > Thương hiệu > Logo ============ */

function Explorer({
  customers,
  customer,
  brand,
  brands,
  logos,
  loading,
  selectedLogo,
  onOpenRoot,
  onOpenCustomer,
  onOpenBrand,
  onCustomerCreated,
  onBrandCreated,
  onSelectLogo,
  onLogoUploaded,
  onNext,
}: {
  customers: CustomerOption[];
  customer: CustomerOption | null;
  brand: BrandOption | null;
  brands: BrandOption[];
  logos: LogoOption[];
  loading: boolean;
  selectedLogo: LogoOption | null;
  onOpenRoot: () => void;
  onOpenCustomer: (c: CustomerOption) => void;
  onOpenBrand: (b: BrandOption) => void;
  onCustomerCreated: (c: CustomerOption) => void;
  onBrandCreated: (b: BrandOption) => void;
  onSelectLogo: (l: LogoOption) => void;
  onLogoUploaded: (l: LogoOption) => void;
  onNext: () => void;
}) {
  const crumbs = [
    { label: "Khách hàng", onClick: customer ? onOpenRoot : undefined },
    ...(customer ? [{ label: customer.name, onClick: brand ? () => onOpenCustomer(customer) : undefined }] : []),
    ...(brand ? [{ label: brand.name }] : []),
  ];

  const level = brand ? "logo" : customer ? "brand" : "customer";
  const title =
    level === "customer"
      ? "Bước 1: Mở thư mục khách hàng"
      : level === "brand"
        ? `Bước 1: Mở thư mục thương hiệu của ${customer!.name}`
        : `Bước 1: Chọn logo của ${brand!.name}`;
  const hint =
    level === "customer"
      ? "Mỗi khách hàng là một thư mục, bên trong là các thương hiệu, bên trong thương hiệu là các logo."
      : level === "brand"
        ? "Mở thư mục thương hiệu để xem các logo, hoặc tạo thư mục thương hiệu mới."
        : "Bấm vào logo để chọn, hoặc tải logo mới lên thư mục này.";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PathBar crumbs={crumbs} />

        {level === "customer" && (
          <CustomerFolders customers={customers} onOpen={onOpenCustomer} onCreated={onCustomerCreated} />
        )}
        {level === "brand" && (
          <BrandFolders customer={customer!} brands={brands} loading={loading} onOpen={onOpenBrand} onCreated={onBrandCreated} />
        )}
        {level === "logo" && (
          <LogoFiles
            brand={brand!}
            canUpload={customer?.editable ?? false}
            logos={logos}
            loading={loading}
            selected={selectedLogo}
            onSelect={onSelectLogo}
            onUploaded={onLogoUploaded}
          />
        )}

        {level === "logo" && (
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Button type="button" className="h-11 px-6" disabled={!selectedLogo} onClick={onNext}>
              Tiếp tục: chọn trang mẫu
              <ChevronRightIcon />
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedLogo ? `Đã chọn logo ${selectedLogo.width}x${selectedLogo.height}px` : "Chưa chọn logo nào."}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FolderSkeletons() {
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

/* ---------- Cấp 1: thư mục khách hàng ---------- */

function CustomerFolders({
  customers,
  onOpen,
  onCreated,
}: {
  customers: CustomerOption[];
  onOpen: (c: CustomerOption) => void;
  onCreated: (c: CustomerOption) => void;
}) {
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(customers.length === 0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s
      ? customers.filter((c) => c.name.toLowerCase().includes(s) || (c.phone ?? "").toLowerCase().includes(s))
      : customers;
    return list.slice(0, 60);
  }, [customers, q]);

  function create() {
    setError(null);
    startTransition(async () => {
      const r = await createCustomerAction({ name, phone, note });
      if (r.error) return setError(r.error);
      toast.success("Đã tạo thư mục khách hàng.");
      onCreated(r.customer!);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {customers.length > 0 && (
        <div className="relative sm:max-w-md">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên hoặc số điện thoại/Zalo"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 pl-9"
            aria-label="Tìm khách hàng"
          />
        </div>
      )}

      {showNew && (
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
          <p className="font-medium">Thư mục khách hàng mới</p>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-name">Tên khách hàng</Label>
              <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-phone">Số điện thoại hoặc Zalo</Label>
              <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={50} className="h-10" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-note">Ghi chú</Label>
            <Input id="c-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} className="h-10" />
          </div>
          <div className="flex gap-2">
            <Button type="button" className="h-10" onClick={create} disabled={pending || !name.trim()}>
              {pending && <Loader2Icon className="animate-spin" />}
              Tạo và mở thư mục
            </Button>
            {customers.length > 0 && (
              <Button type="button" variant="ghost" className="h-10" onClick={() => setShowNew(false)}>
                Hủy
              </Button>
            )}
          </div>
        </div>
      )}

      <TileGrid>
        {!showNew && <NewTile label="Khách hàng mới" icon={<FolderPlusIcon />} onClick={() => setShowNew(true)} />}
        {filtered.map((c) => (
          <FolderTile
            key={c.id}
            name={c.name}
            subtitle={c.phone ? `${c.phone}` : `Sale: ${c.ownerName}`}
            count={c.brandCount}
            countLabel="thương hiệu"
            onClick={() => onOpen(c)}
          />
        ))}
      </TileGrid>
      {customers.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">Không thấy khách nào khớp &quot;{q}&quot;.</p>
      )}
    </div>
  );
}

/* ---------- Cấp 2: thư mục thương hiệu ---------- */

function BrandFolders({
  customer,
  brands,
  loading,
  onOpen,
  onCreated,
}: {
  customer: CustomerOption;
  brands: BrandOption[];
  loading: boolean;
  onOpen: (b: BrandOption) => void;
  onCreated: (b: BrandOption) => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      const r = await createBrandAction(customer.id, name);
      if (r.error) return setError(r.error);
      toast.success("Đã tạo thư mục thương hiệu.");
      setName("");
      setShowNew(false);
      onCreated(r.brand!);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {showNew && customer.editable && (
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
          <p className="font-medium">Thư mục thương hiệu mới</p>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5 sm:max-w-sm">
            <Label htmlFor="b-name">Tên thương hiệu</Label>
            <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} className="h-10" />
          </div>
          <div className="flex gap-2">
            <Button type="button" className="h-10" onClick={create} disabled={pending || !name.trim()}>
              {pending && <Loader2Icon className="animate-spin" />}
              Tạo và mở thư mục
            </Button>
            <Button type="button" variant="ghost" className="h-10" onClick={() => setShowNew(false)}>
              Hủy
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <FolderSkeletons />
      ) : (
        <TileGrid>
          {customer.editable && !showNew && (
            <NewTile label="Thương hiệu mới" icon={<FolderPlusIcon />} onClick={() => setShowNew(true)} />
          )}
          {brands.map((b) => (
            <FolderTile key={b.id} name={b.name} count={b.logoCount} countLabel="logo" onClick={() => onOpen(b)} />
          ))}
        </TileGrid>
      )}

      {!loading && brands.length === 0 && (
        <p className="text-sm text-muted-foreground">Khách này chưa có thương hiệu nào.</p>
      )}
      {!customer.editable && (
        <Alert>
          <AlertDescription>
            Khách hàng này do {customer.ownerName} phụ trách nên bạn không thêm thương hiệu mới được, nhưng vẫn dùng
            được các thương hiệu có sẵn.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/* ---------- Cấp 3: các tệp logo ---------- */

function LogoFiles({
  brand,
  canUpload,
  logos,
  loading,
  selected,
  onSelect,
  onUploaded,
}: {
  brand: BrandOption;
  canUpload: boolean;
  logos: LogoOption[];
  loading: boolean;
  selected: LogoOption | null;
  onSelect: (l: LogoOption) => void;
  onUploaded: (l: LogoOption) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setError(null);
    setWarning(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("brandId", brand.id);
      fd.set("note", note);
      fd.set("file", file);
      const res = await fetch("/api/uploads/logo", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { error?: string; logo?: LogoOption; warning?: string | null };
      if (!res.ok || !body.logo) {
        setError(body.error ?? "Không tải được logo. Vui lòng thử lại.");
        return;
      }
      setWarning(body.warning ?? null);
      setNote("");
      toast.success("Đã tải logo lên.");
      onUploaded(body.logo);
    } catch {
      setError("Mất kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setUploading(false);
      input.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {warning && (
        <Alert>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <FolderSkeletons />
      ) : (
        <TileGrid>
          {canUpload && (
            <NewTile label={uploading ? "Đang tải..." : "Tải logo mới"} icon={uploading ? <Loader2Icon className="animate-spin" /> : <ImagePlusIcon />}>
              <input
                id="l-file"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
                onChange={upload}
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
              selected={selected?.id === l.id}
              onClick={() => onSelect(l)}
            />
          ))}
        </TileGrid>
      )}

      {!loading && logos.length === 0 && <p className="text-sm text-muted-foreground">Thư mục này chưa có logo nào.</p>}

      {canUpload ? (
        <div className="flex flex-col gap-1.5 sm:max-w-sm">
          <Label htmlFor="l-note">Ghi chú cho logo sắp tải lên (không bắt buộc)</Label>
          <Input id="l-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className="h-10" />
          <p className="text-xs text-muted-foreground">PNG, JPG, WEBP hoặc SVG, tối đa 10MB.</p>
        </div>
      ) : (
        <Alert>
          <AlertDescription>
            Khách hàng này do người khác phụ trách nên bạn không tải thêm logo được, nhưng vẫn dùng được logo có sẵn.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
