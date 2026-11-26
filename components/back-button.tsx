"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Nút "Quay lại" trang vừa xem (danh sách phiên của logo ở mục Khách hàng, Lịch sử, Trang chính...). Dùng lịch sử của
 * trình duyệt để về đúng chỗ đang đứng; trang được mở thẳng (tab mới, dán link) không có trang trước thì về `fallbackHref`.
 */
export function BackButton({ fallbackHref, label = "Quay lại" }: { fallbackHref: string; label?: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      className="h-9 self-start"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
    >
      <ArrowLeftIcon /> {label}
    </Button>
  );
}
