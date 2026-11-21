"use client";

import { useEffect, useState, useTransition } from "react";
import { EyeIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  assignLeadAction,
  deleteLeadAction,
  getLeadDetailAction,
  linkCustomerAction,
  searchCustomersAction,
  updateLeadAction,
  type LeadActionResult,
  type LeadDetail,
} from "./actions";

export const STATUS_LABEL: Record<string, string> = {
  NEW: "Mới",
  CONTACTED: "Đã liên hệ",
  QUALIFIED: "Có nhu cầu",
  WON: "Chốt đơn",
  LOST: "Mất",
  INVALID: "Không hợp lệ",
};

export type LeadRow = {
  id: string;
  name: string;
  phone: string | null;
  zalo: string | null;
  email: string | null;
  profileUrl: string | null;
  leadType: "CUSTOMER" | "SUPPLIER";
  status: string;
  assignedToId: string | null;
  customerId: string | null;
  customerName: string | null;
  note: string;
  groupName: string | null;
  postUrl: string;
  snippet: string;
  createdAt: string;
  sourceCount: number;
};

function toastResult(r: LeadActionResult) {
  if (r.error) toast.error(r.error);
  else if (r.ok) toast.success(r.ok);
}

/** Đổi nhanh trạng thái ngay trên dòng của bảng. */
export function QuickStatus({ id, status, note }: { id: string; status: string; note: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <NativeSelect
      value={status}
      disabled={pending}
      className="h-8 w-36 text-xs"
      aria-label="Trạng thái lead"
      onChange={(e) => startTransition(async () => toastResult(await updateLeadAction(id, { status: e.target.value, note })))}
    >
      {Object.entries(STATUS_LABEL).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </NativeSelect>
  );
}

export function LeadDetailDialog({
  lead,
  assignable,
  canDelete,
}: {
  lead: LeadRow;
  /** Danh sách người có thể gán; null = người xem không có quyền gán. */
  assignable: { id: string; name: string }[] | null;
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState(lead.status);
  const [note, setNote] = useState(lead.note);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void getLeadDetailAction(lead.id).then((r) => {
      if (!alive) return;
      if ("error" in r) setLoadError(r.error);
      else {
        setDetail(r);
        setLoadError(null);
      }
    });
    return () => {
      alive = false;
    };
  }, [open, lead.id]);

  const run = (fn: () => Promise<LeadActionResult>) => startTransition(async () => toastResult(await fn()));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <EyeIcon />
        Chi tiết
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lead.name}</DialogTitle>
          <DialogDescription>
            {lead.leadType === "SUPPLIER" ? "Tìm bên sản xuất" : "Tìm khách"} · {lead.groupName ?? "Trang cá nhân"} · {lead.createdAt}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-sm">
          <div className="grid gap-1">
            {lead.phone && <div>Số điện thoại: <b className="select-all">{lead.phone}</b></div>}
            {lead.zalo && <div>Zalo: <b className="select-all">{lead.zalo}</b></div>}
            {lead.email && <div>Email: <b className="select-all">{lead.email}</b></div>}
            {lead.profileUrl && (
              <div>
                <a href={lead.profileUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4">
                  Trang Facebook của người này
                </a>
              </div>
            )}
            <div>
              <a href={lead.postUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4">
                Mở bài đăng gốc
              </a>
            </div>
          </div>

          <div>
            <div className="mb-1 font-medium">Comment gốc ({detail?.sources.length ?? lead.sourceCount})</div>
            {loadError && <p className="text-destructive">{loadError}</p>}
            {!detail && !loadError && <p className="text-muted-foreground">Đang tải...</p>}
            <div className="flex flex-col gap-2">
              {detail?.sources.map((s, i) => (
                <blockquote key={i} className="rounded-lg border bg-muted/40 p-2.5">
                  <div className="whitespace-pre-wrap break-words">{s.text}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {s.authorName} · {s.timeText ?? s.at} · {s.groupName ?? "Trang cá nhân"} ·{" "}
                    <a href={s.postUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4">
                      bài đăng
                    </a>
                  </div>
                </blockquote>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`st-${lead.id}`}>Trạng thái</Label>
              <NativeSelect id={`st-${lead.id}`} value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {assignable && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`as-${lead.id}`}>Sale phụ trách</Label>
                <NativeSelect
                  id={`as-${lead.id}`}
                  defaultValue={lead.assignedToId ?? ""}
                  disabled={pending}
                  onChange={(e) => run(() => assignLeadAction(lead.id, e.target.value || null))}
                >
                  <option value="">Chưa gán</option>
                  {assignable.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`nt-${lead.id}`}>Ghi chú</Label>
            <Textarea id={`nt-${lead.id}`} rows={3} maxLength={5000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div>
            <Button className="h-10 px-4" disabled={pending} onClick={() => run(() => updateLeadAction(lead.id, { status, note }))}>
              {pending && <Loader2Icon className="animate-spin" />}
              Lưu trạng thái và ghi chú
            </Button>
          </div>

          <div className="rounded-lg border p-3">
            <div className="mb-2 font-medium">Khách hàng trong hệ thống</div>
            {lead.customerId ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>Đã gắn: <b>{lead.customerName}</b></span>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => linkCustomerAction(lead.id, null))}>
                  Bỏ gắn
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {detail && detail.suggestions.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted-foreground">Trùng số điện thoại, bấm để gắn:</span>
                    {detail.suggestions.map((c) => (
                      <Button key={c.id} variant="secondary" size="sm" className="justify-start" disabled={pending} onClick={() => run(() => linkCustomerAction(lead.id, c.id))}>
                        {c.name} {c.phone ? `· ${c.phone}` : ""}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm khách theo tên hoặc số điện thoại" className="h-9" />
                  <Button variant="outline" size="sm" className="h-9" onClick={() => void searchCustomersAction(q).then(setFound)}>
                    Tìm
                  </Button>
                </div>
                {found.map((c) => (
                  <Button key={c.id} variant="ghost" size="sm" className="justify-start" disabled={pending} onClick={() => run(() => linkCustomerAction(lead.id, c.id))}>
                    {c.name} {c.phone ? `· ${c.phone}` : ""}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {canDelete && (
            <div>
              <Button
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm("Xoá lead này cùng các comment liên quan? Không khôi phục được.")) return;
                  startTransition(async () => {
                    const r = await deleteLeadAction(lead.id);
                    toastResult(r);
                    if (r.ok) setOpen(false);
                  });
                }}
              >
                <Trash2Icon />
                Xoá lead và comment liên quan
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
