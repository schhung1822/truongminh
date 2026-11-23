"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon, EyeIcon, Loader2Icon, MailIcon, PhoneIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  assignLeadAction,
  bulkAssignAction,
  bulkUpdateStatusAction,
  deleteLeadAction,
  getLeadDetailAction,
  linkCustomerAction,
  searchCustomersAction,
  updateLeadAction,
  type LeadActionResult,
  type LeadDetail,
} from "./actions";
import { STATUS_LABEL, STATUS_TONE } from "./lead-status";

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

/** Bấm để sao chép số điện thoại / Zalo. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={`Sao chép ${label}`}
      aria-label={`Sao chép ${label}`}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setDone(true);
            toast.success(`Đã sao chép ${label}: ${value}`);
            setTimeout(() => setDone(false), 1500);
          })
          .catch(() => toast.error("Không sao chép được. Hãy bôi đen số rồi sao chép tay."));
      }}
    >
      {done ? <CheckIcon className="size-3.5 text-emerald-600" /> : <CopyIcon className="size-3.5" />}
    </button>
  );
}

/** Đổi nhanh trạng thái ngay trên dòng của bảng. */
export function QuickStatus({ id, status, note }: { id: string; status: string; note: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <NativeSelect
      value={status}
      disabled={pending}
      className={`h-8 w-36 text-xs font-medium ${STATUS_TONE[status] ?? ""}`}
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

const BULK_NONE = "__none__"; // dùng làm value cho "Bỏ gán" (ô chọn gốc không gán được value null)

/**
 * Bảng lead của trang danh sách: có ô chọn để xử lý nhiều lead cùng lúc (đổi trạng thái, gán sale), ngoài các thao tác
 * trên từng dòng (xem leads-client.tsx các component ở trên). `rows` chỉ gồm các lead của trang hiện tại.
 */
export function LeadsTable({
  rows,
  assignable,
  canDelete,
  currentUserId,
  currentUserName,
  userNames,
}: {
  rows: LeadRow[];
  /** null = người xem không có quyền gán (sale) */
  assignable: { id: string; name: string }[] | null;
  canDelete: boolean;
  currentUserId: string;
  currentUserName: string;
  userNames: Record<string, string>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>("CONTACTED");
  const [pending, startTransition] = useTransition();

  // Đổi trang hoặc đổi bộ lọc có thể làm vài id đã chọn không còn hiển thị; tính lại tập "còn hợp lệ" ngay lúc đọc
  // (không đồng bộ vào state bằng effect) để không "gán nhầm" lead đã khuất khỏi mắt.
  const active = useMemo(() => {
    const ids = new Set(rows.map((r) => r.id));
    return new Set([...selected].filter((id) => ids.has(id)));
  }, [selected, rows]);

  const allSelected = rows.length > 0 && rows.every((r) => active.has(r.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runBulkStatus() {
    const ids = [...active];
    startTransition(async () => {
      const r = await bulkUpdateStatusAction(ids, bulkStatus);
      toastResult(r);
      if (r.ok) setSelected(new Set());
    });
  }
  function runBulkAssign(value: string) {
    const ids = [...active];
    startTransition(async () => {
      const r = await bulkAssignAction(ids, value === BULK_NONE ? null : value);
      toastResult(r);
      if (r.ok) setSelected(new Set());
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {active.size > 0 && (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5 shadow-md">
          <span className="text-sm font-medium">Đã chọn {active.size} lead</span>
          <div className="flex items-center gap-1.5">
            <NativeSelect
              value={bulkStatus}
              disabled={pending}
              aria-label="Đổi trạng thái hàng loạt"
              className="h-9 w-36 text-sm"
              onChange={(e) => setBulkStatus(e.target.value)}
            >
              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
            <Button type="button" size="sm" className="h-9" disabled={pending} onClick={runBulkStatus}>
              {pending && <Loader2Icon className="animate-spin" />}
              Đổi trạng thái
            </Button>
          </div>
          {assignable && (
            <NativeSelect
              defaultValue=""
              disabled={pending}
              aria-label="Gán sale phụ trách hàng loạt"
              className="h-9 w-44 text-sm"
              onChange={(e) => {
                if (e.target.value) runBulkAssign(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="" disabled>
                Gán cho...
              </option>
              <option value={BULK_NONE}>Bỏ gán</option>
              {assignable.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          )}
          <Button type="button" variant="ghost" size="sm" className="ml-auto h-9" onClick={() => setSelected(new Set())}>
            <XIcon /> Bỏ chọn
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Chọn tất cả lead trong trang này" />
              </TableHead>
              <TableHead>Khách</TableHead>
              <TableHead>Liên hệ</TableHead>
              <TableHead>Nguồn</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Phụ trách</TableHead>
              <TableHead>Lúc</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={r.status === "NEW" ? "bg-blue-500/[0.04]" : undefined}>
                <TableCell className="align-top">
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} aria-label={`Chọn ${r.name}`} />
                </TableCell>
                <TableCell className="max-w-64 whitespace-normal align-top">
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
                </TableCell>
                <TableCell className="align-top text-sm">
                  {r.phone && (
                    <div className="flex items-center gap-1">
                      <PhoneIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <a href={`tel:${r.phone}`} className="select-all font-medium tabular-nums hover:underline">
                        {r.phone}
                      </a>
                      <CopyButton value={r.phone} label="số điện thoại" />
                    </div>
                  )}
                  {r.zalo && r.zalo !== r.phone && (
                    <div className="flex items-center gap-1 text-xs">
                      Zalo{" "}
                      <a href={`https://zalo.me/${r.zalo}`} target="_blank" rel="noreferrer noopener" className="tabular-nums underline underline-offset-4">
                        {r.zalo}
                      </a>
                      <CopyButton value={r.zalo} label="số Zalo" />
                    </div>
                  )}
                  {r.email && (
                    <div className="flex items-center gap-1 text-xs">
                      <MailIcon className="size-3 shrink-0 text-muted-foreground" />
                      <a href={`mailto:${r.email}`} className="truncate hover:underline">
                        {r.email}
                      </a>
                    </div>
                  )}
                </TableCell>
                <TableCell className="max-w-44 align-top text-sm">
                  <div className="truncate" title={r.groupName ?? "Trang cá nhân"}>
                    {r.groupName ?? "Trang cá nhân"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.leadType === "SUPPLIER" ? "Tìm bên sản xuất" : "Tìm khách"}
                    {r.sourceCount > 1 ? ` · ${r.sourceCount} comment` : ""}
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <QuickStatus id={r.id} status={r.status} note={r.note} />
                </TableCell>
                <TableCell className="align-top text-sm">
                  {r.assignedToId ? (userNames[r.assignedToId] ?? (r.assignedToId === currentUserId ? currentUserName : "Đã gán")) : <span className="text-muted-foreground">Chưa gán</span>}
                  {r.customerName && <div className="text-xs text-muted-foreground">Khách: {r.customerName}</div>}
                </TableCell>
                <TableCell className="whitespace-nowrap align-top text-sm">{r.createdAt}</TableCell>
                <TableCell className="text-right align-top">
                  <LeadDetailDialog lead={r} assignable={assignable} canDelete={canDelete} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
