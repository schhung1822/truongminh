import { TriangleAlertIcon } from "lucide-react";
import type { MissingParam, MissingScope } from "@/lib/quoting/types";

const SCOPE_LABEL: Record<MissingScope, string> = {
  material: "Chất liệu và tấm",
  machine: "Máy",
  config: "Cấu hình giá",
  logo: "Logo",
};
const SCOPE_ORDER: MissingScope[] = ["material", "machine", "config", "logo"];

/** Danh sách từng mục còn thiếu (nhãn + nơi bổ sung), gom theo nhóm. KHÔNG hiện bất kỳ con số giá nào. */
export function MissingList({ missing }: { missing: MissingParam[] }) {
  const groups = SCOPE_ORDER.map((scope) => ({ scope, items: missing.filter((m) => m.scope === scope) })).filter((g) => g.items.length > 0);
  const known = new Set<string>(SCOPE_ORDER);
  const other = missing.filter((m) => !known.has(m.scope));
  if (other.length) groups.push({ scope: "config", items: other });
  return (
    <div className="flex flex-col gap-2">
      {groups.map((g, gi) => (
        <div key={`${g.scope}-${gi}`}>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{SCOPE_LABEL[g.scope]}</p>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm">
            {g.items.map((m) => (
              <li key={m.code}>
                <span className="font-medium">{m.label}</span>
                <span className="text-muted-foreground"> — bổ sung tại: {m.hint}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Hộp cảnh báo "Thiếu thông số, chưa tính được giá" kèm danh sách mục thiếu. */
export function MissingBox({ message, missing }: { message: string; missing: MissingParam[] }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="flex items-center gap-2 font-semibold">
        <TriangleAlertIcon className="size-5 shrink-0" />
        {message}
      </p>
      <p className="text-sm">Hệ thống không đoán số liệu nên chưa có giá. Nhờ quản trị viên bổ sung các mục dưới đây rồi bấm Tính giá lại.</p>
      <MissingList missing={missing} />
    </div>
  );
}
