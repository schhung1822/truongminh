"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";
import type { OptionRow } from "@/lib/materials/option-types";

export type FilterValues = {
  q: string;
  status: string;
  view: string;
  base: string;
  tech: string;
  finish: string;
  pattern: string;
  colors: string;
  color: string;
  tag: string;
};

/**
 * Hàng bộ lọc theo phân loại. Chọn xong tự lọc ngay (đổi địa chỉ trang), giữ nguyên ô tìm kiếm, kiểu xem và tình trạng.
 * Mỗi ô chỉ liệt kê giá trị còn bật trong danh mục, cộng giá trị đang được chọn.
 */
export function MaterialFilters({ values, options }: { values: FilterValues; options: OptionRow[] }) {
  const router = useRouter();

  function change(key: keyof FilterValues, value: string) {
    const next = { ...values, [key]: value };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v && !(k === "view" && v === "grid")) sp.set(k, v);
    }
    const s = sp.toString();
    router.push(`/admin/materials${s ? `?${s}` : ""}`);
  }

  const list = (type: OptionRow["type"], current: string) => options.filter((o) => o.type === type && (o.isActive || o.value === current));
  const selects: { key: keyof FilterValues; label: string; items: { value: string; label: string }[] }[] = [
    { key: "base", label: "Nhóm chất liệu", items: list("BASE_MATERIAL", values.base) },
    { key: "tech", label: "Công nghệ in", items: list("TECHNIQUE", values.tech) },
    { key: "finish", label: "Chất bề mặt", items: list("SURFACE_FINISH", values.finish) },
    { key: "pattern", label: "Họa tiết", items: list("SURFACE_PATTERN", values.pattern) },
    {
      key: "colors",
      label: "Số màu",
      items: [
        { value: "ONE", label: "1 màu" },
        { value: "TWO", label: "2 màu" },
      ],
    },
    { key: "color", label: "Họ màu", items: list("COLOR_FAMILY", values.color) },
    { key: "tag", label: "Phong cách", items: list("STYLE_TAG", values.tag) },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7" role="group" aria-label="Lọc theo phân loại">
      {selects.map((s) => (
        <label key={s.key} className="flex flex-col gap-1 text-xs text-muted-foreground">
          {s.label}
          <NativeSelect value={values[s.key]} onChange={(e) => change(s.key, e.target.value)} className="h-9 text-foreground">
            <option value="">Tất cả</option>
            {s.items.map((it) => (
              <option key={it.value} value={it.value}>
                {it.label}
              </option>
            ))}
          </NativeSelect>
        </label>
      ))}
    </div>
  );
}
