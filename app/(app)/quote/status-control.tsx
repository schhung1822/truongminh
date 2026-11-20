"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteQuoteAction, setQuoteStatusAction } from "./actions";
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL, isQuoteStatus, type QuoteStatusValue } from "./format";

/**
 * Đổi trạng thái báo giá (Nháp / Đã gửi khách / Khách chốt) và xóa báo giá nháp.
 * Quyền do máy chủ quyết định (chỉ người lập hoặc quản trị viên): bị từ chối thì hiện nguyên lời báo của máy chủ.
 */
export function StatusControl({ id, status, backHref }: { id: string; status: string; backHref: string }) {
  const router = useRouter();
  const current: QuoteStatusValue = isQuoteStatus(status) ? status : "DRAFT";
  const [pendingStatus, setPendingStatus] = useState<QuoteStatusValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changing, startChange] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  function change(next: QuoteStatusValue) {
    if (next === current) return;
    setError(null);
    setPendingStatus(next);
    startChange(async () => {
      const r = await setQuoteStatusAction(id, next);
      setPendingStatus(null);
      if ("error" in r) return setError(r.error);
      toast.success(`Đã chuyển sang "${QUOTE_STATUS_LABEL[next]}".`);
      router.refresh();
    });
  }

  function remove() {
    setDeleteError(null);
    startDelete(async () => {
      const r = await deleteQuoteAction(id);
      if ("error" in r) return setDeleteError(r.error);
      toast.success("Đã xóa báo giá nháp.");
      setConfirmOpen(false);
      router.push(backHref);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Trạng thái báo giá">
        {QUOTE_STATUSES.map((s) => {
          const active = s === current;
          return (
            <Button key={s} type="button" variant={active ? "default" : "outline"} className="h-9" aria-pressed={active} disabled={changing || active} onClick={() => change(s)}>
              {pendingStatus === s ? <Loader2Icon className="animate-spin" /> : active ? <CheckIcon /> : null}
              {QUOTE_STATUS_LABEL[s]}
            </Button>
          );
        })}
        {current === "DRAFT" && (
          <Button
            type="button"
            variant="destructive"
            className="ml-auto h-9"
            onClick={() => {
              setDeleteError(null);
              setConfirmOpen(true);
            }}
          >
            <Trash2Icon />
            Xóa báo giá nháp
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Chỉ người lập báo giá hoặc quản trị viên mới đổi được trạng thái. Chỉ xóa được báo giá còn là nháp.</p>

      <Dialog open={confirmOpen} onOpenChange={(o) => !o && !deleting && setConfirmOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa báo giá nháp này?</DialogTitle>
            <DialogDescription>Báo giá và bảng giá đã lưu sẽ bị xóa, không hoàn lại được.</DialogDescription>
          </DialogHeader>
          {deleteError && (
            <Alert variant="destructive">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Hủy
            </Button>
            <Button type="button" variant="destructive" onClick={remove} disabled={deleting}>
              {deleting && <Loader2Icon className="animate-spin" />}
              Xóa báo giá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
