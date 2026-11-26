"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import type { PickerPin } from "@/app/(app)/sessions/[id]/design/pinterest-actions";
import { Button } from "@/components/ui/button";
import { Explorer } from "@/components/customers/explorer";
import { LogoPanel } from "@/components/customers/logo-panel";
import { preselectedSheets } from "@/lib/default-sheets";
import type { QuickCreateData } from "@/components/customers/quick-create";
import {
  useFolderNav,
  type FolderNavInitial,
} from "@/components/customers/use-folder-nav";
import type { CustomerOption } from "../sessions/new/actions";
import {
  ConfirmStep,
  SheetsStep,
  type SheetOption,
} from "../sessions/new/sheets-steps";

type Step = "browse" | "sheets" | "confirm";

const subscribeNever = () => () => {};
const pinInUrl = () => new URLSearchParams(window.location.search).get("pin");

/**
 * Trang Khách hàng: duyệt thư mục Khách hàng > Thương hiệu > Logo, mở lại các phiên đã làm, và tạo phiên mới với logo
 * đang chọn NGAY TẠI ĐÂY, đủ các cách như ở Trang chính: AI chọn chất liệu, Tất cả chất liệu, hoặc tự
 * chọn trang mẫu rồi xác nhận. Không còn phải chuyển sang Trang chính để chọn trang mẫu.
 */
export function CustomerBrowser({
  customers,
  sheets,
  quick,
  initial,
  pin,
}: {
  customers: CustomerOption[];
  sheets: SheetOption[];
  quick: QuickCreateData;
  /** mở thẳng tới logo này (trang được gọi với ?logoId=) */
  initial: FolderNavInitial | null;
  /** mẫu Pinterest đã chọn ở trang Mẫu Pinterest (?pin=): chọn logo xong thì hộp thiết kế theo mẫu tự mở với mẫu này */
  pin: PickerPin | null;
}) {
  const nav = useFolderNav(customers, initial);
  const [step, setStep] = useState<Step>("browse");
  // tick sẵn các trang mẫu mặc định, giống Trang chính
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(() => preselectedSheets(sheets));
  const { customer, brand, logo } = nav;
  // Mẫu Pinterest chỉ còn "đang cầm" khi nó còn trên địa chỉ trang. Hộp thiết kế theo mẫu xóa nó khỏi địa chỉ sau khi tạo
  // xong; nhờ vậy bấm Quay lại từ trang phiên (Next dựng lại trang này từ dữ liệu cũ, vẫn còn `pin`) không mở lại hộp.
  const urlPinId = useSyncExternalStore(subscribeNever, pinInUrl, () => pin?.id ?? null);
  const [pinDismissed, setPinDismissed] = useState(false);
  const activePin = pin && !pinDismissed && urlPinId === pin.id ? pin : null;

  // Mở thẳng tới một logo: nạp danh sách logo của thương hiệu đó (bình thường chỉ nạp khi bấm mở thư mục)
  useEffect(() => {
    if (initial) nav.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy một lần lúc mở trang
  }, []);

  // Ghi logo đang chọn lên địa chỉ trang: bấm vào một phiên rồi Quay lại (hoặc tải lại trang) là về đúng logo này,
  // không bị trả về danh sách khách hàng từ đầu.
  const logoId = logo?.id ?? null;
  const pinId = activePin?.id ?? null;
  useEffect(() => {
    const sp = new URLSearchParams();
    if (logoId) sp.set("logoId", logoId);
    if (pinId) sp.set("pin", pinId);
    const url = sp.size > 0 ? `/customers?${sp.toString()}` : "/customers";
    if (window.location.pathname + window.location.search !== url)
      window.history.replaceState(null, "", url);
  }, [logoId, pinId]);

  // Đang chọn trang mẫu / xác nhận cho logo đã chọn: thay khung duyệt thư mục bằng các bước đó, có nút quay lại.
  if (step !== "browse" && customer && brand && logo) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => setStep("browse")}
          >
            <ArrowLeftIcon /> Về thư mục {brand.name}
          </Button>
          <p className="text-sm text-muted-foreground">
            Tạo ảnh mẫu cho <b className="text-foreground">{customer.name}</b> ·{" "}
            {brand.name} ·{" "}
            {step === "sheets"
              ? "Bước 1/2: chọn trang mẫu"
              : "Bước 2/2: xác nhận"}
          </p>
        </div>
        {step === "sheets" ? (
          <SheetsStep
            sheets={sheets}
            selected={selectedSheets}
            onChange={setSelectedSheets}
            onNext={() => setStep("confirm")}
          />
        ) : (
          <ConfirmStep
            customer={customer}
            brand={brand}
            logo={logo}
            sheets={sheets.filter((x) => selectedSheets.has(x.id))}
            quota={quick.quota}
            showCost={quick.showCost}
            imageModel={quick.imageModel}
            qualityDefault={quick.qualityDefault}
            onBack={() => setStep("sheets")}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {activePin && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border bg-primary/5 p-2 text-sm"
          role="status"
        >
          <img
            src={activePin.sourceImageUrl}
            alt={activePin.title ?? "Mẫu Pinterest đã chọn"}
            className="size-14 shrink-0 rounded-md border object-cover"
          />
          <span className="min-w-0 flex-1">
            <b>Đang cầm một mẫu Pinterest.</b>{" "}
            {logo
              ? "Bấm nút Mẫu Pinterest bên dưới để thiết kế logo này theo mẫu."
              : "Mở thư mục khách hàng rồi bấm vào logo cần thiết kế theo mẫu này."}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPinDismissed(true)}
          >
            <XIcon /> Bỏ mẫu này
          </Button>
        </div>
      )}
      <Explorer
        nav={nav}
        autoCreate
        logoFooter={
          logo ? (
            <LogoPanel
              key={`${logo.id}:${activePin?.id ?? ""}`}
              logoId={logo.id}
              quick={quick}
              onPickSheets={() => setStep("sheets")}
              initialPins={activePin ? [activePin] : undefined}
            />
          ) : (
            <p className="border-t pt-4 text-sm text-muted-foreground">
              Bấm vào một logo để tạo ảnh mẫu hoặc xem các phiên đã làm.
            </p>
          )
        }
      />
    </div>
  );
}
