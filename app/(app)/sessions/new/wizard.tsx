"use client";

import { useState } from "react";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Explorer } from "@/components/customers/explorer";
import { useFolderNav } from "@/components/customers/use-folder-nav";
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
}: {
  customers: CustomerOption[];
  initial: WizardInitial | null;
  sheets: SheetOption[];
  quota: QuotaInfo;
  showCost: boolean;
}) {
  const nav = useFolderNav(customers, initial);
  const [step, setStep] = useState<Step>(initial ? "sheets" : "browse");
  // mặc định chọn tất cả trang mẫu dùng được
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(
    () => new Set(sheets.filter((x) => x.usable > 0).map((x) => x.id)),
  );

  const stepIndex = STEP_LABELS.findIndex((s) => s.key === step);
  const { customer, brand, logo } = nav;

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
          logoFooter={
            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              <Button type="button" className="h-11 px-6" disabled={!logo} onClick={() => setStep("sheets")}>
                Tiếp tục: chọn trang mẫu
                <ChevronRightIcon />
              </Button>
              <span className="text-sm text-muted-foreground">
                {logo ? `Đã chọn logo ${logo.width}x${logo.height}px` : "Chưa chọn logo nào."}
              </span>
            </div>
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
          onBack={() => setStep("sheets")}
        />
      )}
    </div>
  );
}
