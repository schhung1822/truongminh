"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckIcon, ExternalLinkIcon, Loader2Icon, RotateCcwIcon, SparklesIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { failReasonLabel, INTENT_LABEL, SUPPLIER_TYPE_LABEL, type ReplyStatus, type SupplierTypeValue } from "@/lib/fb/reply-labels";
import {
  approveRepliesAction,
  restoreRepliesAction,
  saveReplyTextAction,
  setReplyIdentityAction,
  skipRepliesAction,
  unapproveRepliesAction,
  type ReplyActionResult,
} from "./actions";

export type ReplyRow = {
  id: string;
  status: ReplyStatus;
  intent: "SUPPLIER_OFFER" | "ANSWER_INTEREST";
  replyAs: "ACCOUNT" | "PAGE";
  pageName: string | null;
  /** false = câu đứng tên fanpage nhưng fanpage đã bị gỡ hoặc đang tạm dừng */
  pageUsable: boolean;
  accountName: string;
  text: string;
  edited: boolean;
  aiGenerated: boolean;
  failReason: string | null;
  authorName: string;
  commentText: string;
  commentTime: string | null;
  postId: string;
  postUrl: string;
  groupName: string | null;
  productRef: string | null;
  hasPhone: boolean;
  supplierType: SupplierTypeValue | null;
  capability: string | null;
  at: string;
};

function toastResult(r: ReplyActionResult) {
  if (r.error) toast.error(r.error);
  else if (r.ok) toast.success(r.ok);
}

/** Ô sửa câu trả lời của một dòng: lưu khi rời ô nếu có đổi. */
function ReplyText({ row, editable }: { row: ReplyRow; editable: boolean }) {
  const [text, setText] = useState(row.text);
  const [saved, setSaved] = useState(row.text);
  const [pending, startTransition] = useTransition();
  if (!editable) return <p className="whitespace-pre-wrap break-words text-sm">{row.text}</p>;
  const dirty = text.trim() !== saved.trim();
  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        value={text}
        rows={3}
        maxLength={1000}
        aria-label={`Câu trả lời cho ${row.authorName}`}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (!dirty || pending) return;
          startTransition(async () => {
            const r = await saveReplyTextAction(row.id, text);
            if (r.error) toast.error(r.error);
            else setSaved(text);
          });
        }}
      />
      <span className="text-xs text-muted-foreground">
        {pending ? "Đang lưu..." : dirty ? "Chưa lưu (bấm ra ngoài ô để lưu)" : `${text.trim().length} ký tự${row.edited || text.trim() !== row.text.trim() ? " · đã sửa tay" : row.aiGenerated ? " · AI soạn" : " · soạn từ mẫu"}`}
      </span>
    </div>
  );
}

function IdentityCell({ row, canSwitch, hasDefaultPage }: { row: ReplyRow; canSwitch: boolean; hasDefaultPage: boolean }) {
  const [pending, startTransition] = useTransition();
  const other = row.replyAs === "PAGE" ? "ACCOUNT" : "PAGE";
  return (
    <div className="flex flex-col gap-1 text-sm">
      {row.replyAs === "PAGE" ? (
        <span>
          Fanpage <b>{row.pageName ?? "(đã gỡ)"}</b>
          {!row.pageUsable && <span className="block text-xs text-destructive">Fanpage này đã bị gỡ hoặc đang tạm dừng</span>}
        </span>
      ) : (
        <span>
          Nick <b>{row.accountName}</b>
        </span>
      )}
      {row.replyAs === "PAGE" && <span className="text-xs text-muted-foreground">Nick {row.accountName} mở bài và chuyển danh tính</span>}
      {canSwitch && (other === "ACCOUNT" || hasDefaultPage) && (
        <button
          type="button"
          disabled={pending}
          className="w-fit text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          onClick={() => startTransition(async () => toastResult(await setReplyIdentityAction(row.id, other)))}
        >
          {other === "ACCOUNT" ? "Đổi sang trả lời bằng nick" : "Đổi sang trả lời bằng fanpage"}
        </button>
      )}
    </div>
  );
}

/**
 * Bảng hàng chờ của MỘT trạng thái. Có ô chọn để duyệt cả lô (v1.1 mục 6) hoặc bỏ qua nhiều dòng; các dòng của cùng một bài
 * đứng cạnh nhau và có vạch ngăn giữa các bài.
 */
export function RepliesTable({ rows, status, hasDefaultPage }: { rows: ReplyRow[]; status: ReplyStatus; hasDefaultPage: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  // Đổi trang hoặc đổi lọc có thể làm vài id đã chọn không còn hiển thị: chỉ tính các dòng đang thấy
  const active = useMemo(() => {
    const ids = new Set(rows.map((r) => r.id));
    return new Set([...selected].filter((id) => ids.has(id)));
  }, [selected, rows]);
  const allSelected = rows.length > 0 && rows.every((r) => active.has(r.id));
  const selectable = status === "DRAFT" || status === "APPROVED" || status === "SKIPPED" || status === "FAILED" || status === "FILLED";

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePost = (postId: string) => {
    const ids = rows.filter((r) => r.postId === postId).map((r) => r.id);
    const every = ids.every((id) => active.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (every) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };
  const run = (fn: (ids: string[]) => Promise<ReplyActionResult>, ids = [...active]) =>
    startTransition(async () => {
      const r = await fn(ids);
      toastResult(r);
      if (r.ok) setSelected(new Set());
    });

  const editable = status === "DRAFT" || status === "APPROVED";
  const canSwitch = status === "DRAFT" || status === "APPROVED" || status === "FAILED" || status === "SKIPPED";

  return (
    <div className="flex flex-col gap-3">
      {selectable && (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5 shadow-sm">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={allSelected} onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Chọn tất cả câu trong trang này" />
            {active.size > 0 ? `Đã chọn ${active.size} câu` : "Chọn tất cả"}
          </label>
          {status === "DRAFT" && (
            <Button type="button" size="sm" className="h-9" disabled={pending || active.size === 0} onClick={() => run(approveRepliesAction)}>
              {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
              Duyệt cả lô đã chọn
            </Button>
          )}
          {status === "APPROVED" && (
            <Button type="button" size="sm" variant="outline" className="h-9" disabled={pending || active.size === 0} onClick={() => run(unapproveRepliesAction)}>
              <RotateCcwIcon />
              Bỏ duyệt
            </Button>
          )}
          {(status === "DRAFT" || status === "APPROVED" || status === "FAILED") && (
            <Button type="button" size="sm" variant="outline" className="h-9" disabled={pending || active.size === 0} onClick={() => run(skipRepliesAction)}>
              <XIcon />
              Bỏ qua
            </Button>
          )}
          {(status === "SKIPPED" || status === "FAILED" || status === "FILLED") && (
            <Button type="button" size="sm" variant="outline" className="h-9" disabled={pending || active.size === 0} onClick={() => run(restoreRepliesAction)}>
              <RotateCcwIcon />
              Đưa về chờ duyệt
            </Button>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const firstOfPost = i === 0 || rows[i - 1].postId !== r.postId;
          const inPost = rows.filter((x) => x.postId === r.postId).length;
          return (
            <li key={r.id} className="flex flex-col gap-3">
              {firstOfPost && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 pt-1 text-sm">
                  <a href={r.postUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
                    {r.groupName ?? "Bài trên trang cá nhân"} <ExternalLinkIcon className="size-3 opacity-60" />
                  </a>
                  {r.productRef && <span className="text-muted-foreground">Sản phẩm: {r.productRef}</span>}
                  <span className="text-muted-foreground">{inPost} câu trong trang này</span>
                  {selectable && inPost > 1 && (
                    <button type="button" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => togglePost(r.postId)}>
                      Chọn / bỏ chọn cả bài
                    </button>
                  )}
                </div>
              )}
              <div className="grid gap-3 rounded-xl border p-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.3fr)_13rem]">
                <div className="pt-1">{selectable && <Checkbox checked={active.has(r.id)} onCheckedChange={() => toggleOne(r.id)} aria-label={`Chọn câu trả lời cho ${r.authorName}`} />}</div>

                <div className="min-w-0 text-sm">
                  <div className="font-medium">
                    {r.authorName}
                    {r.commentTime && <span className="ml-2 text-xs font-normal text-muted-foreground">{r.commentTime}</span>}
                  </div>
                  <blockquote className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-2">{r.commentText}</blockquote>
                  <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{INTENT_LABEL[r.intent]}</span>
                    {r.supplierType && <span>· {SUPPLIER_TYPE_LABEL[r.supplierType]}</span>}
                    {r.intent === "SUPPLIER_OFFER" && <span>· {r.hasPhone ? "có số điện thoại (xem ở Lead)" : "chưa có số điện thoại"}</span>}
                  </div>
                  {r.capability && <p className="mt-1 text-xs text-muted-foreground">Năng lực: {r.capability}</p>}
                </div>

                <div className="min-w-0">
                  <ReplyText key={r.id + r.text} row={r} editable={editable} />
                  {r.failReason && (status === "FAILED" || status === "SKIPPED") && <p className="mt-1.5 text-xs text-destructive">{failReasonLabel(r.failReason)}</p>}
                </div>

                <div className="flex flex-col gap-2">
                  <IdentityCell row={r} canSwitch={canSwitch} hasDefaultPage={hasDefaultPage} />
                  <span className="text-xs text-muted-foreground">{r.at}</span>
                  <div className="flex flex-wrap gap-2">
                    {status === "DRAFT" && (
                      <>
                        <Button type="button" size="sm" disabled={pending} onClick={() => run(approveRepliesAction, [r.id])}>
                          <CheckIcon />
                          Duyệt
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(skipRepliesAction, [r.id])}>
                          Bỏ qua
                        </Button>
                      </>
                    )}
                    {r.aiGenerated && !r.edited && status === "DRAFT" && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <SparklesIcon className="size-3" /> AI soạn
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
