"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FolderPlusIcon, ImagePlusIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { autoCatalogSessionAction } from "@/app/(app)/sessions/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderTile, ImageTile, NewTile, PathBar, TileGrid } from "@/components/folder-ui";
import {
  createBrandAction,
  createCustomerAction,
  type BrandOption,
  type CustomerOption,
  type LogoOption,
} from "@/app/(app)/sessions/new/actions";
import { FolderActions } from "./folder-actions";
import type { FolderNav } from "./use-folder-nav";

/**
 * Duyệt cây thư mục Khách hàng > Thương hiệu > Logo. Dùng ở Trang chính (chọn logo để tạo phiên)
 * và ở trang Khách hàng (quản lý). `logoFooter` là phần hiện bên dưới các logo (nút tiếp tục, danh sách phiên...).
 */
export function Explorer({
  nav,
  stepPrefix = "",
  logoFooter,
  autoCreate = false,
}: {
  nav: FolderNav;
  /** tiền tố tiêu đề, ví dụ "Bước 1: " */
  stepPrefix?: string;
  logoFooter?: React.ReactNode;
  /** true = sau khi tải logo mới lên, AI tự chọn chất liệu hợp và tạo ảnh mẫu ngay (D115) */
  autoCreate?: boolean;
}) {
  const { customer, brand } = nav;
  // AI đang phân tích logo vừa tải lên: tạm ẩn các nút tạo phiên bên dưới để không bấm trùng thành hai phiên
  const [analysing, setAnalysing] = useState(false);
  const crumbs = [
    { label: "Khách hàng", onClick: customer ? nav.openRoot : undefined },
    ...(customer ? [{ label: customer.name, onClick: brand ? () => nav.openCustomer(customer) : undefined }] : []),
    ...(brand ? [{ label: brand.name }] : []),
  ];

  const level = brand ? "logo" : customer ? "brand" : "customer";
  const title =
    level === "customer"
      ? `${stepPrefix}Mở thư mục khách hàng`
      : level === "brand"
        ? `${stepPrefix}Mở thư mục thương hiệu của ${customer!.name}`
        : `${stepPrefix}Chọn logo của ${brand!.name}`;
  const hint =
    level === "customer"
      ? "Mỗi khách hàng là một thư mục, bên trong là các thương hiệu, bên trong thương hiệu là các logo."
      : level === "brand"
        ? "Mở thư mục thương hiệu để xem các logo, hoặc tạo thư mục thương hiệu mới."
        : autoCreate
          ? "Bấm vào một logo để chọn, hoặc tải logo mới lên (AI sẽ tự chọn chất liệu và tạo ảnh mẫu)."
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
          <CustomerFolders
            customers={nav.customers}
            onOpen={nav.openCustomer}
            onCreated={nav.onCustomerCreated}
            onRenamed={nav.onCustomerRenamed}
            onDeleted={nav.onCustomerDeleted}
          />
        )}
        {level === "brand" && (
          <BrandFolders
            customer={customer!}
            brands={nav.brands}
            loading={nav.loading}
            onOpen={nav.openBrand}
            onCreated={nav.onBrandCreated}
            onRenamed={nav.onBrandRenamed}
            onDeleted={nav.onBrandDeleted}
          />
        )}
        {level === "logo" && (
          <LogoFiles
            brand={brand!}
            canUpload={customer?.editable ?? false}
            logos={nav.logos}
            loading={nav.loading}
            selected={nav.logo}
            onSelect={nav.setLogo}
            onUploaded={nav.onLogoUploaded}
            autoCreate={autoCreate}
            analysing={analysing}
            onAnalysing={setAnalysing}
          />
        )}

        {level === "logo" && !analysing && logoFooter}
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
  onRenamed,
  onDeleted,
}: {
  customers: CustomerOption[];
  onOpen: (c: CustomerOption) => void;
  onCreated: (c: CustomerOption) => void;
  onRenamed: (id: string, name: string) => void;
  onDeleted: (id: string) => void;
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
    return list.slice(0, 120);
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
            actions={
              <FolderActions
                kind="customer"
                id={c.id}
                name={c.name}
                onRenamed={(n) => onRenamed(c.id, n)}
                onDeleted={() => onDeleted(c.id)}
              />
            }
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
  onRenamed,
  onDeleted,
}: {
  customer: CustomerOption;
  brands: BrandOption[];
  loading: boolean;
  onOpen: (b: BrandOption) => void;
  onCreated: (b: BrandOption) => void;
  onRenamed: (id: string, name: string) => void;
  onDeleted: (id: string) => void;
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
            <FolderTile
              key={b.id}
              name={b.name}
              count={b.logoCount}
              countLabel="logo"
              onClick={() => onOpen(b)}
              actions={
                <FolderActions
                  kind="brand"
                  id={b.id}
                  name={b.name}
                  onRenamed={(n) => onRenamed(b.id, n)}
                  onDeleted={() => onDeleted(b.id)}
                />
              }
            />
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
  autoCreate,
  analysing,
  onAnalysing,
}: {
  brand: BrandOption;
  canUpload: boolean;
  logos: LogoOption[];
  loading: boolean;
  selected: LogoOption | null;
  onSelect: (l: LogoOption) => void;
  onUploaded: (l: LogoOption) => void;
  autoCreate: boolean;
  analysing: boolean;
  onAnalysing: (busy: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const [badge, setBadge] = useState(false);
  // tự phân tích và tạo ảnh mẫu sau khi tải lên (bỏ tick nếu chỉ muốn lưu logo, chưa tạo ảnh)
  const [autoRun, setAutoRun] = useState(true);

  /** Logo vừa tải lên: AI chọn chất liệu hợp rồi tạo ảnh mẫu, xong thì sang trang kết quả. Lỗi thì ở lại để tự bấm nút tạo ảnh. */
  async function runAuto(logo: LogoOption) {
    onAnalysing(true);
    try {
      const r = await autoCatalogSessionAction(logo.id);
      if (r.error || !r.sessionId) {
        setError(r.error ?? "Không tạo được ảnh mẫu tự động. Hãy bấm một nút tạo ảnh bên dưới.");
        return;
      }
      toast.success("AI đang xem logo và chọn chất liệu. Ảnh mẫu sẽ tự hiện ở trang phiên.");
      router.push(`/sessions/${r.sessionId}`);
    } catch {
      setError("Không gửi được yêu cầu phân tích logo. Logo đã lưu, hãy bấm \"AI chọn chất liệu\" bên dưới để thử lại.");
    } finally {
      onAnalysing(false);
    }
  }

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
      fd.set("isBadge", String(badge));
      fd.set("file", file);
      const res = await fetch("/api/uploads/logo", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { error?: string; logo?: LogoOption; warning?: string | null };
      if (!res.ok || !body.logo) {
        setError(body.error ?? "Không tải được logo. Vui lòng thử lại.");
        return;
      }
      setWarning(body.warning ?? null);
      setNote("");
      setBadge(false);
      toast.success("Đã tải logo lên.");
      onUploaded(body.logo);
      if (autoCreate && autoRun) void runAuto(body.logo);
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
      {analysing && (
        <Alert role="status">
          <AlertDescription className="flex items-center gap-2">
            <Loader2Icon className="size-4 shrink-0 animate-spin" />
            Đang bắt đầu để AI xem logo và chọn chất liệu, sẽ chuyển sang trang phiên ngay.
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <FolderSkeletons />
      ) : (
        <TileGrid>
          {canUpload && (
            <NewTile
              label={uploading ? "Đang tải..." : "Tải logo mới"}
              icon={uploading ? <Loader2Icon className="animate-spin" /> : <ImagePlusIcon />}
            >
              <input
                id="l-file"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
                onChange={upload}
                disabled={uploading || analysing}
                className="sr-only"
                aria-label="File logo"
              />
            </NewTile>
          )}
          {logos.map((l) => (
            <ImageTile
              key={l.id}
              src={l.url}
              caption={`${l.width}x${l.height}px${l.isBadge ? " · Huy hiệu" : ""}${l.note ? ` · ${l.note}` : ""}`}
              selected={selected?.id === l.id}
              onClick={() => onSelect(l)}
            />
          ))}
        </TileGrid>
      )}

      {!loading && logos.length === 0 && <p className="text-sm text-muted-foreground">Thư mục này chưa có logo nào.</p>}

      {/* Tùy chọn tải lên ít khi cần đổi nên thu gọn, bấm mới mở. Công tắc "logo đang chọn là dạng huy hiệu" đã bỏ (D126): AI tự nhận khi chọn chất liệu. */}
      {canUpload ? (
        <details className="text-sm">
          <summary className="w-fit cursor-pointer text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Tùy chọn khi tải logo mới</summary>
          <div className="mt-2 flex flex-col gap-1.5 sm:max-w-md">
            <Label htmlFor="l-note">Ghi chú cho logo sắp tải lên (không bắt buộc)</Label>
            <Input id="l-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className="h-10" />
            {autoCreate && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} className="size-4" />
                Tải lên xong thì AI tự chọn chất liệu hợp và tạo ảnh mẫu ngay
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={badge} onChange={(e) => setBadge(e.target.checked)} className="size-4" />
              Logo sắp tải lên là dạng huy hiệu / bảng
            </label>
            <p className="text-xs text-muted-foreground">
              PNG, JPG, WEBP hoặc SVG, tối đa 15MB.
              {autoCreate && autoRun ? " Không tick ô huy hiệu thì AI tự nhận xét logo có phải dạng huy hiệu không." : ""}
            </p>
          </div>
        </details>
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
