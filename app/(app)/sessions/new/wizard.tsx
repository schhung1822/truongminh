"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckIcon, ChevronRightIcon, Loader2Icon, PlusIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
type Step = "customer" | "brand" | "logo" | "sheets" | "confirm";

const STEP_LABELS: { key: Step; label: string }[] = [
  { key: "customer", label: "Khách hàng" },
  { key: "brand", label: "Thương hiệu" },
  { key: "logo", label: "Logo" },
  { key: "sheets", label: "Trang mẫu" },
  { key: "confirm", label: "Xác nhận" },
];

function Checker({ children, className }: { children: React.ReactNode; className?: string }) {
  // nền caro để thấy rõ logo có nền trong suốt
  return (
    <div
      className={cn("flex items-center justify-center overflow-hidden rounded-lg border", className)}
      style={{
        backgroundColor: "#fff",
        backgroundImage:
          "linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)",
        backgroundSize: "16px 16px",
        backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
      }}
    >
      {children}
    </div>
  );
}

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
  const [step, setStep] = useState<Step>(initial ? "sheets" : "customer");
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [logos, setLogos] = useState<LogoOption[]>([]);
  const [loading, startLoading] = useTransition();
  // mặc định chọn tất cả trang mẫu dùng được
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(
    () => new Set(sheets.filter((x) => x.usable > 0).map((x) => x.id)),
  );

  const stepIndex = STEP_LABELS.findIndex((s) => s.key === step);

  function chooseCustomer(c: CustomerOption) {
    setCustomer(c);
    setBrand(null);
    setLogo(null);
    setStep("brand");
    startLoading(async () => {
      const r = await listBrandsAction(c.id);
      setBrands(r.brands ?? []);
    });
  }

  function chooseBrand(b: BrandOption) {
    setBrand(b);
    setLogo(null);
    setStep("logo");
    startLoading(async () => {
      const r = await listLogosAction(b.id);
      setLogos(r.logos ?? []);
    });
  }

  function goTo(target: Step) {
    // Chỉ quay lại bước đã đi qua
    setStep(target);
    if (target === "brand" && customer) {
      startLoading(async () => setBrands((await listBrandsAction(customer.id)).brands ?? []));
    }
    if (target === "logo" && brand) {
      startLoading(async () => setLogos((await listLogosAction(brand.id)).logos ?? []));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tiến trình */}
      <ol className="flex flex-wrap gap-2 text-sm">
        {STEP_LABELS.map((s, i) => {
          const done = i < stepIndex;
          const reachable = done;
          return (
            <li key={s.key}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => goTo(s.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors",
                  i === stepIndex && "border-primary bg-primary text-primary-foreground",
                  done && "bg-muted hover:bg-muted/70",
                  !done && i !== stepIndex && "text-muted-foreground",
                )}
              >
                {done ? <CheckIcon className="size-3.5" /> : <span className="font-semibold">{i + 1}</span>}
                {s.label}
                {done && s.key === "customer" && customer && <span className="max-w-32 truncate">: {customer.name}</span>}
                {done && s.key === "brand" && brand && <span className="max-w-32 truncate">: {brand.name}</span>}
              </button>
            </li>
          );
        })}
      </ol>

      {step === "customer" && (
        <CustomerStep
          customers={customers}
          onChoose={chooseCustomer}
          onCreated={(c) => {
            setCustomers((prev) => [c, ...prev]);
            chooseCustomer(c);
          }}
        />
      )}

      {step === "brand" && customer && (
        <BrandStep
          customer={customer}
          brands={brands}
          loading={loading}
          onChoose={chooseBrand}
          onCreated={(b) => {
            setBrands((prev) => [b, ...prev]);
            chooseBrand(b);
          }}
        />
      )}

      {step === "logo" && brand && (
        <LogoStep
          brand={brand}
          canUpload={customer?.editable ?? false}
          logos={logos}
          loading={loading}
          selected={logo}
          onSelect={setLogo}
          onUploaded={(l) => {
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

/* ---------------- Bước 1: khách hàng ---------------- */

function CustomerStep({
  customers,
  onChoose,
  onCreated,
}: {
  customers: CustomerOption[];
  onChoose: (c: CustomerOption) => void;
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
    return list.slice(0, 50);
  }, [customers, q]);

  function create() {
    setError(null);
    startTransition(async () => {
      const r = await createCustomerAction({ name, phone, note });
      if (r.error) return setError(r.error);
      toast.success("Đã tạo khách hàng.");
      onCreated(r.customer!);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bước 1: Chọn khách hàng</CardTitle>
        <CardDescription>Tìm khách đã có theo tên hoặc số điện thoại, hoặc tạo khách mới.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {customers.length > 0 && (
          <>
            <Input
              placeholder="Tìm theo tên hoặc số điện thoại/Zalo"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-10"
              aria-label="Tìm khách hàng"
            />
            <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {filtered.length === 0 && <li className="text-sm text-muted-foreground">Không thấy khách nào khớp.</li>}
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onChoose(c)}
                    className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.phone || "Chưa có số điện thoại"} · Sale phụ trách: {c.ownerName}
                      </p>
                    </div>
                    <ChevronRightIcon className="size-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {!showNew ? (
          <Button type="button" variant="outline" className="h-10 self-start" onClick={() => setShowNew(true)}>
            <PlusIcon /> Tạo khách hàng mới
          </Button>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <p className="font-medium">Khách hàng mới</p>
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
                Tạo và tiếp tục
              </Button>
              {customers.length > 0 && (
                <Button type="button" variant="ghost" className="h-10" onClick={() => setShowNew(false)}>
                  Hủy
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Bước 2: thương hiệu ---------------- */

function BrandStep({
  customer,
  brands,
  loading,
  onChoose,
  onCreated,
}: {
  customer: CustomerOption;
  brands: BrandOption[];
  loading: boolean;
  onChoose: (b: BrandOption) => void;
  onCreated: (b: BrandOption) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      const r = await createBrandAction(customer.id, name);
      if (r.error) return setError(r.error);
      toast.success("Đã tạo thương hiệu.");
      setName("");
      onCreated(r.brand!);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bước 2: Chọn thương hiệu của {customer.name}</CardTitle>
        <CardDescription>Mỗi khách có thể có nhiều thương hiệu, mỗi thương hiệu có nhiều logo.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
        {!loading && brands.length === 0 && <p className="text-sm text-muted-foreground">Khách này chưa có thương hiệu nào.</p>}
        <ul className="flex flex-col gap-2">
          {brands.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onChoose(b)}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.logoCount} logo</p>
                </div>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>

        {customer.editable ? (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <p className="font-medium">Thương hiệu mới</p>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5 sm:max-w-sm">
              <Label htmlFor="b-name">Tên thương hiệu</Label>
              <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} className="h-10" />
            </div>
            <Button type="button" className="h-10 self-start" onClick={create} disabled={pending || !name.trim()}>
              {pending && <Loader2Icon className="animate-spin" />}
              Tạo và tiếp tục
            </Button>
          </div>
        ) : (
          <Alert>
            <AlertDescription>
              Khách hàng này do {customer.ownerName} phụ trách nên bạn không thêm thương hiệu mới được, nhưng vẫn dùng
              được các thương hiệu có sẵn.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Bước 3: logo ---------------- */

function LogoStep({
  brand,
  canUpload,
  logos,
  loading,
  selected,
  onSelect,
  onUploaded,
  onNext,
}: {
  brand: BrandOption;
  canUpload: boolean;
  logos: LogoOption[];
  loading: boolean;
  selected: LogoOption | null;
  onSelect: (l: LogoOption) => void;
  onUploaded: (l: LogoOption) => void;
  onNext: () => void;
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
    <Card>
      <CardHeader>
        <CardTitle>Bước 3: Chọn logo của {brand.name}</CardTitle>
        <CardDescription>Chọn logo đã có hoặc tải logo mới (PNG, JPG, WEBP, SVG, tối đa 10MB).</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
        {logos.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {logos.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => onSelect(l)}
                  aria-pressed={selected?.id === l.id}
                  className={cn(
                    "flex w-full flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors hover:bg-muted",
                    selected?.id === l.id && "border-primary ring-2 ring-primary",
                  )}
                >
                  <Checker className="aspect-square w-full">
                    <img src={l.url} alt="Logo" className="max-h-full max-w-full object-contain" />
                  </Checker>
                  <span className="truncate text-xs text-muted-foreground">
                    {l.width}x{l.height}px{l.note ? ` · ${l.note}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!loading && logos.length === 0 && <p className="text-sm text-muted-foreground">Thương hiệu này chưa có logo nào.</p>}

        {canUpload ? (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="font-medium">Tải logo mới</p>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="l-note">Ghi chú (không bắt buộc)</Label>
              <Input id="l-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="l-file">File logo</Label>
              <Input
                id="l-file"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
                onChange={upload}
                disabled={uploading}
                className="h-10 pt-1.5"
              />
            </div>
          </div>
          {uploading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" /> Đang tải và xử lý logo...
            </p>
          )}
        </div>
        ) : (
          <Alert>
            <AlertDescription>Khách hàng này do người khác phụ trách nên bạn không tải thêm logo được, nhưng vẫn dùng được logo có sẵn.</AlertDescription>
          </Alert>
        )}

        <Button type="button" className="h-11 self-start px-6" disabled={!selected} onClick={onNext}>
          <UploadIcon className="hidden" />
          Tiếp tục: chọn trang mẫu
          <ChevronRightIcon />
        </Button>
      </CardContent>
    </Card>
  );
}
