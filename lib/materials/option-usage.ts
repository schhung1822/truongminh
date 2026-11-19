import "server-only";
import { db } from "@/lib/db";
import type { OptionType } from "./option-types";

/** Số lượt chất liệu đang dùng từng giá trị: usage[loại][value]. Họ màu tính cả mặt trước lẫn mặt sau. */
export async function countOptionUsage(): Promise<Record<OptionType, Record<string, number>>> {
  const out: Record<OptionType, Record<string, number>> = {
    BASE_MATERIAL: {},
    TECHNIQUE: {},
    SURFACE_FINISH: {},
    SURFACE_PATTERN: {},
    COLOR_FAMILY: {},
    STYLE_TAG: {},
    SERIES: {},
  };
  const add = (type: OptionType, rows: { value: string | null; n: number }[]) => {
    for (const r of rows) if (r.value) out[type][r.value] = (out[type][r.value] ?? 0) + r.n;
  };
  const [base, tech, finish, pattern, front, back, series, tags] = await Promise.all([
    db.material.groupBy({ by: ["baseMaterial"], _count: { _all: true } }),
    db.material.groupBy({ by: ["technique"], _count: { _all: true } }),
    db.material.groupBy({ by: ["surfaceFinish"], _count: { _all: true } }),
    db.material.groupBy({ by: ["surfacePattern"], _count: { _all: true } }),
    db.material.groupBy({ by: ["frontColorFamily"], _count: { _all: true } }),
    db.material.groupBy({ by: ["backColorFamily"], _count: { _all: true } }),
    db.material.groupBy({ by: ["seriesCode"], _count: { _all: true } }),
    db.materialStyleTag.groupBy({ by: ["value"], _count: { _all: true } }),
  ]);
  add("BASE_MATERIAL", base.map((r) => ({ value: r.baseMaterial, n: r._count._all })));
  add("TECHNIQUE", tech.map((r) => ({ value: r.technique, n: r._count._all })));
  add("SURFACE_FINISH", finish.map((r) => ({ value: r.surfaceFinish, n: r._count._all })));
  add("SURFACE_PATTERN", pattern.map((r) => ({ value: r.surfacePattern, n: r._count._all })));
  add("COLOR_FAMILY", front.map((r) => ({ value: r.frontColorFamily, n: r._count._all })));
  add("COLOR_FAMILY", back.map((r) => ({ value: r.backColorFamily, n: r._count._all })));
  add("SERIES", series.map((r) => ({ value: r.seriesCode, n: r._count._all })));
  add("STYLE_TAG", tags.map((r) => ({ value: r.value, n: r._count._all })));
  return out;
}
