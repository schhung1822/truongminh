import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, InboxIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireFbManager } from "@/lib/fb/access";
import { fmtDateTime } from "@/lib/fb/format";
import { loadReplyEnv } from "@/lib/fb/offers";
import { INTENT_LABEL, REPLY_AS_LABEL, REPLY_STATUS_HINT, REPLY_STATUS_LABEL, REPLY_STATUS_TONE, REPLY_STATUSES, type ReplyStatus } from "@/lib/fb/reply-labels";
import { pageWindow } from "@/lib/pagination";
import { RepliesTable, type ReplyRow } from "./replies-client";

export const metadata: Metadata = { title: "Hàng chờ trả lời" };

const PAGE_SIZE = 50;

type Params = { status?: string; as?: string; intent?: string; page?: string };

export default async function FbRepliesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireFbManager();
  const params = await searchParams;
  const status: ReplyStatus = (REPLY_STATUSES as readonly string[]).includes(params.status ?? "") ? (params.status as ReplyStatus) : "DRAFT";
  const replyAs = params.as === "ACCOUNT" || params.as === "PAGE" ? params.as : "";
  const intent = params.intent === "SUPPLIER_OFFER" || params.intent === "ANSWER_INTEREST" ? params.intent : "";

  const base: Prisma.FbReplyQueueWhereInput[] = [];
  if (user.role !== "ADMIN") base.push({ account: { userId: user.id } }); // marketing: chỉ bài do nick của mình quét
  if (replyAs) base.push({ replyAs });
  if (intent) base.push({ intent });

  const [statusGroups, env] = await Promise.all([db.fbReplyQueue.groupBy({ by: ["status"], where: { AND: base }, _count: { _all: true } }), loadReplyEnv()]);
  const countOf = new Map(statusGroups.map((g) => [g.status as string, g._count._all]));
  const total = countOf.get(status) ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1), totalPages);

  const rows = await db.fbReplyQueue.findMany({
    where: { AND: [...base, { status }] },
    // dòng của cùng một bài đứng cạnh nhau để đọc và duyệt cả lô theo bài
    orderBy: [{ comment: { postId: "asc" } }, { createdAt: "asc" }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      page: { select: { name: true, status: true } },
      account: { select: { displayName: true } },
      lead: { select: { phone: true, supplierType: true, capability: true } },
      comment: { select: { authorName: true, text: true, timeText: true, post: { select: { id: true, url: true, productRef: true, group: { select: { name: true, pageJoined: true } } } } } },
    },
  });

  const list: ReplyRow[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    intent: r.intent,
    replyAs: r.replyAs,
    pageName: r.page?.name ?? null,
    pageUsable: r.replyAs === "ACCOUNT" || r.page?.status === "ACTIVE",
    accountName: r.account.displayName,
    text: r.finalText ?? r.draftText,
    edited: r.finalText !== null,
    aiGenerated: r.aiGenerated,
    failReason: r.failReason,
    authorName: r.comment.authorName,
    commentText: r.comment.text,
    commentTime: r.comment.timeText,
    postId: r.comment.post.id,
    postUrl: r.comment.post.url,
    groupName: r.comment.post.group?.name ?? null,
    productRef: r.comment.post.productRef,
    hasPhone: !!r.lead?.phone,
    supplierType: r.lead?.supplierType ?? null,
    capability: r.lead?.capability ?? null,
    at: fmtDateTime(r.sentAt ?? r.filledAt ?? r.approvedAt ?? r.createdAt),
  }));

  const href = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const cur: Record<string, string | undefined> = { status: status === "DRAFT" ? undefined : status, as: replyAs || undefined, intent: intent || undefined, ...over };
    for (const [k, v] of Object.entries(cur)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `/fb/replies?${s}` : "/fb/replies";
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Hàng chờ trả lời</h1>
        <p className="max-w-3xl text-muted-foreground">
          Câu trả lời soạn sẵn cho comment trên các bài đang theo dõi. Bạn đọc, sửa và duyệt; extension chỉ điền sẵn câu đã duyệt vào Facebook rồi dừng lại, bạn đọc lại và tự bấm gửi.
        </p>
      </div>

      {!env.defaultPage && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
          <TriangleAlertIcon className="size-5 shrink-0 text-amber-600" />
          <p className="text-sm">
            Chưa có fanpage mặc định. Câu mời nhà sản xuất sẽ đứng tên nick (hoặc không được soạn, tùy cấu hình) và thiếu tên fanpage.{" "}
            <Link href="/fb/templates" className="underline underline-offset-4">
              Thêm fanpage
            </Link>
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Lọc theo trạng thái">
        {REPLY_STATUSES.map((s) => (
          <Link
            key={s}
            href={href({ status: s === "DRAFT" ? undefined : s, page: undefined })}
            aria-current={status === s ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${status === s ? "border-foreground bg-foreground text-background" : `${REPLY_STATUS_TONE[s]} hover:brightness-95`}`}
          >
            {REPLY_STATUS_LABEL[s]} <span className="ml-1 tabular-nums opacity-80">{countOf.get(s) ?? 0}</span>
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <form method="get" action="/fb/replies" className="flex flex-wrap items-center gap-3">
            {status !== "DRAFT" && <input type="hidden" name="status" value={status} />}
            <NativeSelect name="as" defaultValue={replyAs} aria-label="Người đứng tên" className="w-52">
              <option value="">Nick và fanpage</option>
              <option value="PAGE">Trả lời bằng {REPLY_AS_LABEL.PAGE.toLowerCase()}</option>
              <option value="ACCOUNT">Trả lời bằng {REPLY_AS_LABEL.ACCOUNT.toLowerCase()}</option>
            </NativeSelect>
            <NativeSelect name="intent" defaultValue={intent} aria-label="Loại câu" className="w-52">
              <option value="">Mọi loại câu</option>
              <option value="SUPPLIER_OFFER">{INTENT_LABEL.SUPPLIER_OFFER}</option>
              <option value="ANSWER_INTEREST">{INTENT_LABEL.ANSWER_INTEREST}</option>
            </NativeSelect>
            <Button type="submit" className="h-10 px-4">
              Lọc
            </Button>
            {(replyAs || intent) && (
              <Button type="button" variant="outline" className="h-10 px-4" render={<Link href={href({ as: undefined, intent: undefined, page: undefined })} />}>
                Xoá lọc
              </Button>
            )}
          </form>

          <p className="text-sm text-muted-foreground">
            {REPLY_STATUS_HINT[status]} {total > 0 ? `Đang xem ${(page - 1) * PAGE_SIZE + 1}–${Math.min(total, page * PAGE_SIZE)} trên ${total} câu.` : ""}
          </p>

          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <InboxIcon className="size-8 opacity-60" />
              <p>
                {status === "DRAFT"
                  ? "Chưa có câu nào chờ duyệt. Câu mời xuất hiện sau khi extension quét được comment của nhà sản xuất trên bài có mục đích Tìm bên sản xuất."
                  : "Không có câu nào ở trạng thái này."}
              </p>
            </div>
          ) : (
            <RepliesTable rows={list} status={status} hasDefaultPage={env.defaultPage !== null} />
          )}

          {totalPages > 1 && (
            <nav aria-label="Phân trang" className="flex flex-wrap items-center justify-center gap-1.5">
              <Button variant="outline" size="sm" disabled={page <= 1} render={page <= 1 ? undefined : <Link href={href({ page: String(page - 1) })} />} nativeButton={page <= 1}>
                <ChevronLeftIcon />
                Trước
              </Button>
              {pageWindow(page, totalPages).map((n, i) =>
                n === null ? (
                  <span key={`gap-${i}`} className="px-1 text-muted-foreground">
                    …
                  </span>
                ) : (
                  <Button
                    key={n}
                    variant={n === page ? "default" : "outline"}
                    size="sm"
                    className="min-w-8 tabular-nums"
                    aria-current={n === page ? "page" : undefined}
                    render={<Link href={href({ page: n === 1 ? undefined : String(n) })} />}
                    nativeButton={false}
                  >
                    {n}
                  </Button>
                ),
              )}
              <Button variant="outline" size="sm" disabled={page >= totalPages} render={page >= totalPages ? undefined : <Link href={href({ page: String(page + 1) })} />} nativeButton={page >= totalPages}>
                Sau
                <ChevronRightIcon />
              </Button>
            </nav>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
