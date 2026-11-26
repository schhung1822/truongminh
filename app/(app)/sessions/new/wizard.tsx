"use client";

import { useEffect, useState } from "react";
import { CheckIcon } from "lucide-react";
import { Explorer } from "@/components/customers/explorer";
import { LogoPanel } from "@/components/customers/logo-panel";
import type { QuickCreateData } from "@/components/customers/quick-create";
import { useFolderNav } from "@/components/customers/use-folder-nav";
import { pickDefaultSheets, preselectedSheets } from "@/lib/default-sheets";
import { cn } from "@/lib/utils";
import { ConfirmStep, SheetsStep, type QuotaInfo, type SheetOption } from "./sheets-steps";
import type { BrandOption, CustomerOption, LogoOption } from "./actions";

export type WizardInitial = { customer: CustomerOption; brand: BrandOption; logo: LogoOption };
type Step = "browse" | "sheets" | "confirm";

const STEP_LABELS: { key: Step; label: string }[] = [
  { key: "browse", label: "Chọn logo" },
  { key: "sheets", label: "Trang mẫu" },
  { key: "confirm", label: "Xác nhận" },
];

/** Tạo phiên tư vấn mới: chọn logo (duyệt thư mục), chọn trang mẫu, xác nhận. */
export function NewSessionWizard({
  customers,
  initial,
  sheets,
  quota,
  showCost,
  imageModel,
  auto,
  allMaterials,
  isAdmin,
  qualityDefault,
  design,
  startAtBrowse = false,
}: {
  customers: CustomerOption[];
  initial: WizardInitial | null;
  sheets: SheetOption[];
  quota: QuotaInfo;
  showCost: boolean;
  imageModel: string;
  auto: QuickCreateData["auto"];
  allMaterials: QuickCreateData["allMaterials"];
  isAdmin: boolean;
  qualityDefault: boolean;
  design: QuickCreateData["design"];
  /** có `initial` nhưng vẫn đứng ở bước chọn logo (khi Quay lại từ một phiên), thay vì nhảy thẳng sang chọn trang mẫu */
  startAtBrowse?: boolean;
}) {
  const nav = useFolderNav(customers, initial);
  const [step, setStep] = useState<Step>(initial && !startAtBrowse ? "sheets" : "browse");
  // tick sẵn các trang mẫu mặc định (chưa đặt trang mặc định nào thì tick tất cả trang dùng được)
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(() => preselectedSheets(sheets));

  const stepIndex = STEP_LABELS.findIndex((s) => s.key === step);
  const { customer, brand, logo } = nav;

  // Mở thẳng tới một logo ở bước chọn logo: nạp danh sách logo của thương hiệu đó
  useEffect(() => {
    if (initial && startAtBrowse) nav.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy một lần lúc mở trang
  }, []);

  // Ghi logo đang chọn lên địa chỉ trang (giống mục Khách hàng): bấm vào một phiên rồi Quay lại là về đúng logo này.
  const logoId = logo?.id ?? null;
  useEffect(() => {
    if (step !== "browse") return;
    const url = logoId ? `/?logoId=${encodeURIComponent(logoId)}&browse=1` : "/";
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
  }, [logoId, step]);

  function backToBrowse() {
    setStep("browse");
    nav.reload();
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
          nav={nav}
          stepPrefix="Bước 1: "
          autoCreate
          logoFooter={
            logo ? (
              <LogoPanel
                key={logo.id}
                logoId={logo.id}
                quick={{ defaultSheets: pickDefaultSheets(sheets), quota, showCost, imageModel, auto, allMaterials, isAdmin, qualityDefault, design }}
                onPickSheets={() => setStep("sheets")}
              />
            ) : (
              <p className="border-t pt-4 text-sm text-muted-foreground">Bấm vào một logo để tạo ảnh mẫu hoặc xem các phiên đã làm.</p>
            )
          }
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
          showCost={showCost}
          imageModel={imageModel}
          qualityDefault={qualityDefault}
          onBack={() => setStep("sheets")}
        />
      )}
    </div>
  );
}
