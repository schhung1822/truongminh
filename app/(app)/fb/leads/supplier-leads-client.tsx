"use client";

import { useTransition } from "react";
import { CheckIcon, ExternalLinkIcon, MessageCircleIcon, PackageCheckIcon, PhoneCallIcon, PhoneIcon } from "lucide-react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { REPLY_AS_LABEL, REPLY_STATUS_LABEL, REPLY_STATUS_TONE, SUPPLIER_TYPE_LABEL, type ReplyStatus, type SupplierTypeValue } from "@/lib/fb/reply-labels";
import { setSupplierStepAction, setSupplierTypeAction, type SupplierStep } from "./actions";
import { CopyButton, LeadDetailDialog, QuickStatus, type LeadRow } from "./leads-client";

/** Phần riêng của lead nhà sản xuất (v1.1 mục 4.3 và mục 6), tính sẵn ở server theo mã lead. */
export type SupplierInfo = {
  supplierType: SupplierTypeValue;
  capability: string;
  productRef: string;
  materials: string[];
  /** Trạng thái câu mời gần nhất trong hàng chờ; null = chưa soạn câu nào (đang trong thời gian không chào lại, hoặc cấu hình bỏ qua). */
  offerStatus: ReplyStatus | null;
  offerAs: "ACCOUNT" | "PAGE" | null;
  lastOfferedAt: string | null;
  calledAt: string | null;
  zaloMessagedAt: string | null;
  sampleSentAt: string | null;
};

const STEPS: { step: SupplierStep; field: "calledAt" | "zaloMessagedAt" | "sampleSentAt"; label: string; icon: typeof PhoneCallIcon }[] = [
  { step: "called", field: "calledAt", label: "Đã gọi", icon: PhoneCallIcon },
  { step: "zalo", field: "zaloMessagedAt", label: "Đã nhắn Zalo", icon: MessageCircleIcon },
  { step: "sample", field: "sampleSentAt", label: "Đã gửi mẫu", icon: PackageCheckIcon },
];

/** Ba nút việc của sale. Nút đã bấm đổi màu và ghi giờ; bấm lần nữa để bỏ đánh dấu. */
function StepButtons({ leadId, info }: { leadId: string; info: SupplierInfo }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="Việc của sale">
      {STEPS.map(({ step, field, label, icon: Icon }) => {
        const at = info[field];
        return (
          <button
            key={step}
            type="button"
            disabled={pending}
            aria-pressed={at !== null}
            title={at ? `${label} lúc ${at}. Bấm để bỏ đánh dấu.` : `Bấm khi ${label.toLowerCase()}`}
            className={`inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-xs transition-colors disabled:opacity-50 ${at ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "hover:bg-muted"}`}
            onClick={() =>
              startTransition(async () => {
                const r = await setSupplierStepAction(leadId, step, at === null);
                if (r.error) toast.error(r.error);
                else if (r.ok) toast.success(r.ok);
              })
            }
          >
            {at ? <CheckIcon className="size-3.5" /> : <Icon className="size-3.5 text-muted-foreground" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

function TypeSelect({ leadId, value }: { leadId: string; value: SupplierTypeValue }) {
  const [pending, startTransition] = useTransition();
  return (
    <NativeSelect
      value={value}
      disabled={pending}
      aria-label="Loại nhà sản xuất"
      className="h-8 w-36 text-xs"
      onChange={(e) =>
        startTransition(async () => {
          const r = await setSupplierTypeAction(leadId, e.target.value);
          if (r.error) toast.error(r.error);
          else if (r.ok) toast.success(r.ok);
        })
      }
    >
      {Object.entries(SUPPLIER_TYPE_LABEL).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Bảng của tab "Nhà sản xuất": mỗi dòng đủ thông tin để sale gọi hoặc nhắn Zalo mà không phải mở bài gốc. */
export function SupplierLeadsTable({
  rows,
  info,
  assignable,
  canDelete,
  currentUserId,
  currentUserName,
  userNames,
}: {
  rows: LeadRow[];
  info: Record<string, SupplierInfo>;
  assignable: { id: string; name: string }[] | null;
  canDelete: boolean;
  currentUserId: string;
  currentUserName: string;
  userNames: Record<string, string>;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nhà sản xuất</TableHead>
            <TableHead>Liên hệ và việc của sale</TableHead>
            <TableHead>Loại và năng lực</TableHead>
            <TableHead>Sản phẩm nguồn, vật liệu gợi ý, chào</TableHead>
            <TableHead>Trạng thái</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const s = info[r.id];
            if (!s) return null;
            return (
              <TableRow key={r.id} className={r.status === "NEW" ? "bg-blue-500/[0.04]" : undefined}>
                <TableCell className="max-w-52 whitespace-normal align-top">
                  {r.profileUrl ? (
                    <a href={r.profileUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
                      <span className="truncate">{r.name}</span>
                      <ExternalLinkIcon className="size-3 shrink-0 opacity-60" />
                    </a>
                  ) : (
                    <div className="truncate font-medium">{r.name}</div>
                  )}
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground" title={r.snippet}>
                    {r.snippet}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {r.groupName ?? "Trang cá nhân"} · {r.createdAt}
                    {r.sourceCount > 1 ? ` · ${r.sourceCount} comment` : ""}
                  </div>
                </TableCell>

                <TableCell className="max-w-64 whitespace-normal align-top text-sm">
                  {r.phone ? (
                    <div className="flex items-center gap-1">
                      <PhoneIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <a href={`tel:${r.phone}`} className="select-all font-medium tabular-nums hover:underline">
                        {r.phone}
                      </a>
                      <CopyButton value={r.phone} label="số điện thoại" />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Chưa có số (AI nhận ra là xưởng từ nội dung comment)</span>
                  )}
                  {(r.zalo ?? r.phone) && (
                    <a href={`https://zalo.me/${r.zalo ?? r.phone}`} target="_blank" rel="noreferrer noopener" className="text-xs underline underline-offset-4">
                      Mở Zalo
                    </a>
                  )}
                  {r.email && <div className="truncate text-xs">{r.email}</div>}
                  <StepButtons leadId={r.id} info={s} />
                </TableCell>

                <TableCell className="max-w-56 whitespace-normal align-top text-sm">
                  <TypeSelect leadId={r.id} value={s.supplierType} />
                  <p className="mt-1 text-xs text-muted-foreground">{s.capability || "Chưa có tóm tắt năng lực"}</p>
                </TableCell>

                <TableCell className="max-w-56 whitespace-normal align-top text-sm">
                  <a href={r.postUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
                    {s.productRef || "Bài chưa ghi sản phẩm"} <ExternalLinkIcon className="size-3 shrink-0 opacity-60" />
                  </a>
                  <p className="mt-1 text-xs text-muted-foreground">{s.materials.length > 0 ? s.materials.join(", ") : "Bài chưa chọn vật liệu gợi ý"}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                    <span>Câu chào:</span>
                    {s.offerStatus ? (
                      <span className={`inline-block rounded-full border px-2 py-0.5 ${REPLY_STATUS_TONE[s.offerStatus]}`}>
                        {REPLY_STATUS_LABEL[s.offerStatus]}
                        {s.offerAs ? `, bằng ${REPLY_AS_LABEL[s.offerAs].toLowerCase()}` : ""}
                      </span>
                    ) : (
                      <span>chưa soạn</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{s.lastOfferedAt ? `Chào gần nhất: ${s.lastOfferedAt}` : "Chưa gửi câu chào nào"}</div>
                </TableCell>

                <TableCell className="align-top">
                  <QuickStatus id={r.id} status={r.status} note={r.note} />
                  <div className="my-1 text-xs text-muted-foreground">
                    {r.assignedToId ? (userNames[r.assignedToId] ?? (r.assignedToId === currentUserId ? currentUserName : "Đã gán")) : "Chưa gán"}
                  </div>
                  <LeadDetailDialog lead={r} assignable={assignable} canDelete={canDelete} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
