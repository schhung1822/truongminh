"use client";

import type { ReactNode } from "react";

/**
 * Form lọc của trang lead: đổi ô chọn hoặc ngày thì tự lọc ngay, không cần bấm nút.
 * Ô tìm kiếm vẫn lọc khi nhấn Enter. Không có trường `page` nên mỗi lần lọc quay về trang 1.
 */
export function LeadFilterForm({ children }: { children: ReactNode }) {
  return (
    <form
      method="get"
      action="/fb/leads"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onChange={(e) => {
        const t = e.target as HTMLElement;
        if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === "date")) {
          e.currentTarget.requestSubmit();
        }
      }}
    >
      {children}
    </form>
  );
}
